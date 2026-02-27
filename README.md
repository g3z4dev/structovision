# structovision
A web based application that lets you create runnable structograms for your algorithms and visualize its inner workings.

# How to run
First install npm then run the following commands in the root of the directory:
- `npm install`
- `npm run build`
If there is no error then the resulting website should be found in `./app/public/` and can be used by simply opening `index.html` in a browser or by running a webserver of choice in the given directory.

# Known issues
Running `npm run build` sometimes hangs up on the rollup phase. The simple fix to this is to manually terminate the command and try again.