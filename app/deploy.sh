#!/bin/sh
# Builds the app and publishes it to the gh-pages branch (served by GitHub Pages).
set -e
cd "$(dirname "$0")"
BASE_PATH=/folio-reader/ npm run build
cp dist/index.html dist/404.html   # deep links fall back to the app shell
touch dist/.nojekyll
cd dist
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -f -q https://github.com/SuperFlyFlow/folio-reader.git gh-pages
rm -rf .git
echo "Deployed to https://superflyflow.github.io/folio-reader/"
