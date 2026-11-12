#!/usr/bin/env bash
# 一键把声记发布到 https://nha6810.github.io/my-diary
# 用法（Git Bash / macOS / Linux）：
#   GITHUB_TOKEN=ghp_xxx bash deploy.sh
# 或直接运行后按提示粘贴令牌。令牌不会写入任何文件。
set -euo pipefail

cd "$(dirname "$0")"

OWNER="NHA6810"
REPO="my-diary"
BRANCH="main"
SITE="https://nha6810.github.io/my-diary"
REMOTE="https://github.com/${OWNER}/${REPO}.git"
API="https://api.github.com"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  printf '请输入 GitHub 令牌（需 repo 权限用于建仓/推送；fine-grained 令牌请先在网页建好仓库）: '
  read -r -s GITHUB_TOKEN
  printf '\n'
fi
[ -n "$GITHUB_TOKEN" ] || { echo '令牌为空，已取消'; exit 1; }

gh_api() {
  curl -sS -H "Authorization: Bearer ${GITHUB_TOKEN}" \
       -H "Accept: application/vnd.github+json" \
       -H "Content-Type: application/json" "$@"
}

echo '==> 1/5 检查仓库'
code=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" "${API}/repos/${OWNER}/${REPO}")
if [ "$code" = "404" ]; then
  echo '    仓库不存在，尝试自动创建（需要 classic token 的 repo 权限）…'
  created=$(gh_api -X POST "${API}/user/repos" \
    -d "{\"name\":\"${REPO}\",\"private\":false,\"description\":\"声记 · 语音日记\",\"has_wiki\":false}")
  if echo "$created" | grep -q '"full_name"'; then
    echo "    已创建 ${OWNER}/${REPO}"
  else
    echo '    自动建仓失败。请在 https://github.com/new 手动创建公开空仓库 NHA6810/my-diary'
    echo '    （不要勾选 README / .gitignore / License），然后重新运行本脚本。'
    exit 1
  fi
elif [ "$code" = "200" ]; then
  echo "    仓库已存在：${OWNER}/${REPO}"
else
  echo "    仓库接口返回 ${code}，请检查令牌是否有效"
  exit 1
fi

echo '==> 2/5 启用 GitHub Pages（Source = GitHub Actions）'
pages_code=$(gh_api -o /dev/null -w '%{http_code}' -X POST \
  "${API}/repos/${OWNER}/${REPO}/pages" -d '{"build_type":"workflow"}' || true)
case "$pages_code" in
  201|204) echo '    Pages 已启用' ;;
  409)     echo '    Pages 已配置过，跳过' ;;
  *)       echo "    Pages 接口返回 ${pages_code}，若部署失败请到仓库 Settings → Pages 手动把 Source 选为 GitHub Actions" ;;
esac

echo '==> 3/5 初始化本地仓库'
if [ ! -d .git ]; then
  git init -q
  git symbolic-ref HEAD "refs/heads/${BRANCH}"
fi
git add -A
if ! git diff --cached --quiet; then
  git -c user.name='Voice Diary' -c user.email='diary@localhost' \
    commit -q -m 'chore: 声记语音日记站点'
fi
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"   # remote 中不含令牌

AUTH=$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\r\n')
GITAUTH=(-c "http.extraheader=AUTHORIZATION: basic ${AUTH}")

echo '==> 4/5 同步远程（远程可能已有应用写入的日记提交）'
if git "${GITAUTH[@]}" ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git "${GITAUTH[@]}" fetch -q origin "$BRANCH" || true
  git "${GITAUTH[@]}" pull -q --rebase --autostash origin "$BRANCH" || {
    echo '    无法自动变基。请执行 git pull --rebase --allow-unrelated-histories origin main 后重试。'
    exit 1
  }
fi

echo '==> 5/5 推送并触发 Pages 部署'
git "${GITAUTH[@]}" push -u origin "$BRANCH"

echo
echo "完成！稍等 1-2 分钟访问：${SITE}"
echo "如仍显示 404，请检查：仓库 Settings → Pages → Build and deployment → Source 是否为 GitHub Actions，"
echo "以及 Actions 标签页里 Deploy 工作流是否运行成功。"
