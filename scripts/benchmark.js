const fs = require("fs")
const { spawn } = require('child_process')
const { performance } = require('perf_hooks')

// Input for 25x AES
const input_aes_packed = {
	"in": Array.from(Array(25), () => [...Array(128)].map(e=>~~((Math.random() < 0.5) ? 1 : 0))),
	"ks": Array.from(Array(25), () => [...Array(1920)].map(e=>~~((Math.random() < 0.5) ? 1 : 0)))
}

//Input for 100x AES
const input_aes_nopack = {
	"in": Array.from(Array(25), () => [...Array(128)].map(e=>~~((Math.random() < 0.5) ? 1 : 0))),
	"ks": Array.from(Array(25), () => [...Array(1920)].map(e=>~~((Math.random() < 0.5) ? 1 : 0)))
}


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

async function compile() {
	console.log('\x1b[32mCompiling... \x1b[0m')
	
	//Packed version
	const startTime_packed = performance.now()
	await asyncExec(`circom ${__dirname}/../circuits/main_packed.circom --r1cs --c --sym --O1 -o \"${__dirname}/.output\"`)
	const endTime_packed = performance.now()
	console.log(`Compilation (packed) took ${endTime_packed - startTime_packed} milliseconds`)
	
	//Baseline with full optimizations
	const startTime_nopack = performance.now()
	await asyncExec(`circom ${__dirname}/../circuits/nopack.circom --r1cs --c --sym --O2 -o \"${__dirname}/.output\"`)
	const endTime_nopack = performance.now()
	console.log(`Compilation (no pack) took ${endTime_nopack - startTime_nopack} milliseconds`)
}

async function setup() {
	console.log('\x1b[32mSetup... \x1b[0m')
	
	//Packed version
	const startTime_packed = performance.now()
	await asyncExec(`snarkjs groth16 setup ${__dirname}/.output/main_packed.r1cs ${__dirname}/powersOfTau28_hez_final_21_packed.ptau ${__dirname}/.output/main_packed0.zkey`)
	await asyncExec(`snarkjs zkey contribute ${__dirname}/.output/main_packed0.zkey ${__dirname}/.output/main_packed1.zkey --name=\"packed_key\" -v -e=\"pack\"`)
	await asyncExec(`snarkjs zkey export verificationkey ${__dirname}/.output/main_packed1.zkey ${__dirname}/.output/vkey_packed.json`)
	const endTime_packed = performance.now()

	//No pack
	const startTime_nopack = performance.now()
	await asyncExec(`snarkjs groth16 setup ${__dirname}/.output/nopack.r1cs ${__dirname}/powersOfTau28_hez_final_21_nopack.ptau ${__dirname}/.output/nopack0.zkey`)
	await asyncExec(`snarkjs zkey contribute ${__dirname}/.output/nopack0.zkey ${__dirname}/.output/nopack1.zkey --name=\"nopack_key\" -v -e=\"nopack\"`)
	await asyncExec(`snarkjs zkey export verificationkey ${__dirname}/.output/nopack1.zkey ${__dirname}/.output/vkey_nopack.json`)
	const endTime_nopack = performance.now()

	
	console.log(`Setup (packed) took ${endTime_packed - startTime_packed} milliseconds`)
	console.log(`Setup (no pack) took ${endTime_nopack - startTime_nopack} milliseconds`)
}

async function generateWitness() {
	console.log('\x1b[32mGenerating witnesses... \x1b[0m')
	
	//Packed version
	const startTime_packed = performance.now()
	await asyncExec(`make -C ${__dirname}/.output/main_packed_cpp/`)
    await asyncExec(`${__dirname}/.output/main_packed_cpp/main_packed ${__dirname}/.output/input_packed.json ${__dirname}/.output/witness_packed.wtns`)
	const endTime_packed = performance.now()
	console.log(`Generating witness (packed) took ${endTime_packed - startTime_packed} milliseconds`)

	//No pack
	const startTime_nopack = performance.now()
	await asyncExec(`make -C ${__dirname}/.output/nopack_cpp/`)
    await asyncExec(`${__dirname}/.output/nopack_cpp/nopack ${__dirname}/.output/input_nopack.json ${__dirname}/.output/witness_nopack.wtns`)
	const endTime_nopack = performance.now()
	console.log(`Generating witness (no pack) took ${endTime_nopack - startTime_nopack} milliseconds`)
}

async function prove() {
	console.log('\x1b[32mProving... \x1b[0m')

	//Packed version
	const startTime_packed = performance.now()
	await asyncExec(`snarkjs groth16 prove ${__dirname}/.output/main_packed1.zkey ${__dirname}/.output/witness_packed.wtns ${__dirname}/.output/proof_packed.json ${__dirname}/.output/input_packed.json`)
	const endTime_packed = performance.now()
	console.log(`Proving (packed) took ${endTime_packed - startTime_packed} milliseconds`)

	//No pack
	const startTime_nopack = performance.now()
	await asyncExec(`snarkjs groth16 prove ${__dirname}/.output/nopack1.zkey ${__dirname}/.output/witness_nopack.wtns ${__dirname}/.output/proof_nopack.json ${__dirname}/.output/input_nopack.json`)
	const endTime_nopack = performance.now()
	console.log(`Proving (no pack) took ${endTime_nopack - startTime_nopack} milliseconds`)
}

async function main() {
	// Create ./.output/
	if (!fs.existsSync(`${__dirname}/.output`)) {
		fs.mkdirSync(`${__dirname}/.output`)
	}

	//Write input_packed.json 
    console.log('\x1b[32mComputing input_packed... \x1b[0m')
    fs.writeFileSync(`${__dirname}/.output/input_packed.json`, JSON.stringify(input_aes_packed))

	//Write input_nopack.json 
    console.log('\x1b[32mComputing input_nopack... \x1b[0m')
    fs.writeFileSync(`${__dirname}/.output/input_nopack.json`, JSON.stringify(input_aes_nopack))

	await compile();
	await setup();
	await generateWitness();
	await prove();
}

main();