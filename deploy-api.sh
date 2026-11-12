#!/usr/bin/env bash
# 用 GitHub REST API 发布声记站点：建仓 -> 上传文件 -> 开启 Pages -> 触发部署 -> 回访站点
# 不依赖 git push，适合 git 协议被网络环境拦截、或只想粘贴一次令牌的场景。
#
# 用法（Git Bash / macOS / Linux）：
#   GITHUB_TOKEN=ghp_xxx bash deploy-api.sh
# 或直接运行后按提示粘贴令牌。令牌只放在内存与环境变量里，不写入任何文件。
#
# 令牌权限：
#   classic PAT  -> 勾选 repo（含 workflow / Pages 能力）
#   fine-grained -> 目标仓库的 Contents: 读写、Workflows: 读写、Pages: 读写
#                   （fine-grained 令牌无法「新建」仓库，请先在网页建好公开仓库）
#
# 注意：GitHub 免费账户的 Pages 仅支持公开仓库，因此站点仓库必须是 public。
#       日记请另建私有仓库存放，在应用的「设置 → 仓库名」里改过去。
set -euo pipefail

cd "$(dirname "$0")"

OWNER="NHA6810"
REPO="my-diary"
SITE="https://nha6810.github.io/my-diary"
API="https://api.github.com"

PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || { echo '未找到 python，无法编码文件内容'; exit 1; }

if [ -z "${GITHUB_TOKEN:-}" ]; then
  printf '请输入 GitHub 令牌（输入不回显）: '
  read -r -s GITHUB_TOKEN
  printf '\n'
fi
[ -n "$GITHUB_TOKEN" ] || { echo '令牌为空，已取消'; exit 1; }

# 用 POSIX 风格临时目录：部分 Git Bash 的 mktemp 会返回 C:\... 形式的路径，
# 传给 curl -o 时反斜杠会被当成转义符而失败。
TMP="/tmp/vd-deploy-$$"
mkdir -p "$TMP" || { echo '无法创建临时目录'; exit 1; }
# 不用 EXIT trap：命令替换 $(...) 的子 shell 也会触发它并提前删掉响应体文件。
# 改为脚本结束时显式清理；中途失败只在 /tmp 留下一个很小的临时目录。
BODY="$TMP/body.json"

# req METHOD URL [JSON_FILE] -> 输出 HTTP 状态码，响应体写入 $BODY
req() {
  local method="$1" url="$2" data="${3:-}"
  local -a args=(-sS --max-time 60 -X "$method"
    -H "Authorization: Bearer ${GITHUB_TOKEN}"
    -H "Accept: application/vnd.github+json"
    -H "X-GitHub-Api-Version: 2022-11-28"
    -H "Content-Type: application/json")
  [ -z "$data" ] || args+=(--data-binary "@$data")
  curl "${args[@]}" -o "$BODY" -w '%{http_code}' "$url" || echo '000'
}

show_body() { head -c 400 "$BODY" 2>/dev/null || true; echo; }

echo '==> 1/6 校验令牌'
code=$(req GET "$API/user")
if [ "$code" != "200" ]; then
  echo "    令牌无效（HTTP $code）："; show_body; exit 1
fi
LOGIN=$("$PY" -c 'import json,sys; print(json.load(sys.stdin).get("login",""))' < "$BODY")
echo "    已登录账号：$LOGIN"
if [ "$(printf '%s' "$LOGIN" | tr '[:upper:]' '[:lower:]')" != "$(printf '%s' "$OWNER" | tr '[:upper:]' '[:lower:]')" ]; then
  echo "    提示：令牌不属于 $OWNER，请确保它对该账号的 $REPO 仓库有写权限"
fi

echo "==> 2/6 检查 / 创建仓库 $OWNER/$REPO"
code=$(req GET "$API/repos/$OWNER/$REPO")
if [ "$code" = "404" ]; then
  printf '{"name":"%s","private":false,"auto_init":true,"has_wiki":false,"description":"声记 - 语音日记站点"}' "$REPO" > "$TMP/create.json"
  code=$(req POST "$API/user/repos" "$TMP/create.json")
  if [ "$code" != "201" ]; then
    echo "    自动建仓失败（HTTP $code）："; show_body
    echo "    请在 https://github.com/new 手动创建【公开】仓库 $OWNER/$REPO，"
    echo "    务必勾选 Add a README file（让 main 分支存在），然后重跑本脚本。"
    exit 1
  fi
  echo '    已创建公开仓库'
elif [ "$code" = "200" ]; then
  echo '    仓库已存在'
else
  echo "    仓库接口返回 HTTP $code："; show_body; exit 1
fi

# 读取仓库真实默认分支，避免用户在网页建仓时选了 master
code=$(req GET "$API/repos/$OWNER/$REPO")
BRANCH=$("$PY" -c 'import json,sys; d=json.load(sys.stdin); print(d.get("default_branch") or "main")' < "$BODY")
echo "    默认分支：$BRANCH"

echo '==> 3/6 上传站点文件（逐文件提交，已有文件自动带 sha 更新）'
FILES=(index.html css/style.css js/*.js .github/workflows/deploy.yml .gitignore .gitattributes deploy.sh deploy-api.sh)
for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "    跳过（不存在）：$f"; continue; }
  enc=$("$PY" -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe="/"))' "$f")

  gcode=$(req GET "$API/repos/$OWNER/$REPO/contents/$enc?ref=$BRANCH")
  sha=''
  if [ "$gcode" = "200" ]; then
    sha=$("$PY" -c 'import json,sys; print(json.load(sys.stdin).get("sha",""))' < "$BODY")
  fi

  # 不指定 branch：提交到仓库默认分支；空仓库（0 次提交）也能由此创建首个提交
  "$PY" - "$f" "$TMP/payload.json" "$sha" <<'PY'
import base64, json, sys
path, out, sha = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, 'rb') as fh:
    data = fh.read()
obj = {
    "message": "chore: publish " + path,
    "content": base64.b64encode(data).decode("ascii"),
}
if sha:
    obj["sha"] = sha
with open(out, 'w', encoding='utf-8') as fh:
    json.dump(obj, fh, ensure_ascii=False)
PY

  pcode=$(req PUT "$API/repos/$OWNER/$REPO/contents/$enc" "$TMP/payload.json")
  if [ "$pcode" != "200" ] && [ "$pcode" != "201" ]; then
    echo "    上传失败：$f（HTTP $pcode）"; show_body
    if [ "$f" = ".github/workflows/deploy.yml" ]; then
      echo '    这通常是令牌缺少 workflow 权限：classic PAT 请勾选 repo；'
      echo '    fine-grained 令牌请把 Workflows 设为 Read and write 后重试。'
    fi
    exit 1
  fi
  printf '    ok  %s\n' "$f"
done

echo '==> 4/6 启用 GitHub Pages（Source = GitHub Actions）'
printf '{"build_type":"workflow"}' > "$TMP/pages.json"
code=$(req POST "$API/repos/$OWNER/$REPO/pages" "$TMP/pages.json")
if [ "$code" = "409" ] || [ "$code" = "422" ]; then
  code=$(req PUT "$API/repos/$OWNER/$REPO/pages" "$TMP/pages.json")
fi
case "$code" in
  201|204|200) echo '    Pages 已启用' ;;
  *) echo "    Pages 接口返回 HTTP $code（可稍后在仓库 Settings → Pages 把 Source 选为 GitHub Actions）"; show_body ;;
esac

echo '==> 5/6 触发一次部署'
printf '{"ref":"%s"}' "$BRANCH" > "$TMP/dispatch.json"
code=$(req POST "$API/repos/$OWNER/$REPO/actions/workflows/deploy.yml/dispatches" "$TMP/dispatch.json")
case "$code" in
  204) echo '    已触发工作流' ;;
  *)   echo "    未手动触发（HTTP $code，文件提交本身也会触发 push 事件），继续等待站点…" ;;
esac

echo "==> 6/6 等待站点上线（$SITE）"
ok=0
for i in $(seq 1 18); do
  sc=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE/" || echo '000')
  if [ "$sc" = "200" ]; then ok=1; break; fi
  printf '    第 %s 次检查：HTTP %s，10 秒后重试…\n' "$i" "$sc"
  sleep 10
done
echo
if [ "$ok" = "1" ]; then
  echo "站点已上线：$SITE"
else
  echo '站点暂未返回 200（首次部署通常需要 1-3 分钟）。请检查：'
  echo "  https://github.com/$OWNER/$REPO/actions"
  echo "  仓库 Settings → Pages → Build and deployment → Source 是否为 GitHub Actions"
fi
echo
echo '最后一步：打开线上站点 →「设置」→ 填入仅授权「私有日记仓库」的令牌 → 测试连接 → 保存。'
rm -rf "$TMP"
