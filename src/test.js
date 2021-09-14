const exec = require('shelljs').exec;

exec(process.env.cmd, (code, stdout, stderr) => {
    console.log("code:" + code);
    console.log("stdout:" + stdout);
    console.log("stderr" + stderr);
});