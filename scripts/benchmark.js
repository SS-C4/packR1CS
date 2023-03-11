const fs = require("fs")
const { spawn } = require('child_process')
const { performance } = require('perf_hooks')

// Input for 1000x AES
const input_aes = {
	"in": Array.from(Array(128).keys()).map(i => ((Math.random() < 0.5)?1:0).toString()),
	"ks": Array.from(Array(1920).keys()).map(i => ((Math.random() < 0.5)?1:0).toString())
}

// Input for Packed 1000x AES
// ---------

const asyncExec = (command,out_print = 0) => new Promise((resolve, reject) => {
	let stdout = '';
	let stderr = '';
	const child = spawn('sh', ['-c', command]);
	child.stdout.on('data', data => {
		const output = data.toString();
		if (out_print == 1)
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

async function setup() {

}

async function compile() {
	console.log('\x1b[32mCompiling... \x1b[0m')
	
	//Packed version
	const startTime_packed = performance.now()
	await asyncExec(`circom ${__dirname}/../circuits/main_packed.circom --r1cs --c --sym --O1 -o \"${__dirname}/.output\"`,1)
	const endTime_packed = performance.now()
	console.log(`Compilation (packed) took ${endTime_packed - startTime_packed} milliseconds`)
	
	//Baseline with full optimizations
	const startTime_nopack = performance.now()
	await asyncExec(`circom ${__dirname}/../circuits/nopack.circom --r1cs --c --sym --O2 -o \"${__dirname}/.output\"`,1)
	const endTime_nopack = performance.now()
	console.log(`Compilation (no pack) took ${endTime_nopack - startTime_nopack} milliseconds`)
}

async function setup() {
	console.log('\x1b[32mSetup... \x1b[0m')

	//Packed version
	const startTime_packed = performance.now()
	await asyncExec(`snarkjs groth16 setup ${__dirname}/.output/main_packed.r1cs ${__dirname}/powersOfTau28_hez_final_21.ptau ${__dirname}/.output/main_packed0.zkey`)
	await asyncExec(`snarkjs zkey contribute ${__dirname}/.output/main_packed0.zkey ${__dirname}/.output/main_packed1.zkey --name=\"packed_key\" -v -e=\"pack\"`)
	await asyncExec(`snarkjs zkey export verificationkey ${__dirname}/.output/main_packed1.zkey ${__dirname}/.output/vkey_packed.json`)
	const endTime_packed = performance.now()
	console.log(`Setup (packed) took ${endTime_packed - startTime_packed} milliseconds`)

	//No pack
	const startTime_nopack = performance.now()
	await asyncExec(`snarkjs groth16 setup ${__dirname}/.output/nopack.r1cs ${__dirname}/.output/powersOfTau28_hez_final_21.ptau ${__dirname}/.output/nopack0.zkey`)
	await asyncExec(`snarkjs zkey contribute ${__dirname}/.output/nopack0.zkey ${__dirname}/.output/nopack1.zkey --name=\"nopack_key\" -v -e=\"nopack\"`)
	await asyncExec(`snarkjs zkey export verificationkey ${__dirname}/.output/nopack1.zkey ${__dirname}/.output/vkey_nopack.json`)
	const endTime_nopack = performance.now()
	console.log(`Setup (no pack) took ${endTime_nopack - startTime_nopack} milliseconds`)
}

async function prove() {
	console.log('\x1b[32mProving... \x1b[0m')
}

async function main() {
	await compile();
}

main();