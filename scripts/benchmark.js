const fs = require("fs")
const { spawn } = require('child_process')
const { performance } = require('perf_hooks')

// Input for AES
const input_aes = {
	"in": Array.from(Array(128).keys()).map(i => ((Math.random() < 0.5)?1:0).toString()),
	"ks": Array.from(Array(1920).keys()).map(i => ((Math.random() < 0.5)?1:0).toString())
}

const asyncExec = command => new Promise((resolve, reject) => {
	let stdout = '';
	let stderr = '';
	const child = spawn('sh', ['-c', command]);
	child.stdout.on('data', data => {
		const output = data.toString();
		console.log(output);
		stdout += output;
	});
	child.stderr.on('data', data => {
		const output = data.toString();
		console.error(output);
		stderr += output;
	});
	child.on('error', reject);
	child.on('exit', () => resolve([stdout, stderr]));
})

async function compile() {
	console.log('\x1b[32m Compiling circuit... \x1b[0m')
	const startTime = performance.now()
	await asyncExec(`circom ${__dirname}/../circuits/sha256/testcirc.circom --r1cs --c -o \"${__dirname}/.output\"`)
	const endTime = performance.now()
	console.log(`Compilation took ${endTime - startTime} milliseconds`)
}

async function main() {
	console.log("Input: ", input_aes)
}

main();