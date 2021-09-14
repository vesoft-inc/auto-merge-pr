const exec = require('shelljs').exec;

exec(process.env.cmd, (code, stdout, stderr) => {
    console.log(code);
    console.log(stdout);
    console.log(stderr);
});