cd c:\Users\scott\projects\galaxy-campaign-map
git add -A
git commit -m "Add warp gates, Dyson spheres, and 3D gate model."
git push -u origin HEAD
git log -1 --oneline > _git_out.txt
git status >> _git_out.txt
