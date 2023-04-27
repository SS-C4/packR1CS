import { existsSync, mkdirSync, writeFileSync } from "fs";
import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import { assert } from 'console';

const pf = 11;
const total = 44;
assert(total % pf == 0, "total must be a multiple of pf");

//Input for pf SHA unpacked
const input_sha_nopack = {
	"in": Array.from(Array(total), () => [...Array(1024)].map(e=>~~((Math.random() < 0.5) ? 1 : 0)))
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
	
	// //Packed version
	// const startTime_packed = performance.now()
	// await asyncExec(`circom ./../circuits/main_packed.circom --r1cs --c --sym --O1 -o \"./.output\"`)
	// const endTime_packed = performance.now()
	// console.log(`Compilation (packed) took ${endTime_packed - startTime_packed} milliseconds`)
	
	//Baseline with full optimizations
	const startTime_nopack = performance.now()
	await asyncExec(`circom ./../circuits/nopack.circom --r1cs --c --sym --O2 -p bls12381 -o \"./.output\"`)
	const endTime_nopack = performance.now()
	console.log(`Compilation (no pack) took ${endTime_nopack - startTime_nopack} milliseconds`)
}

async function setup() {
	console.log('\x1b[32mSetup... \x1b[0m')
	
	//Packed version
	const startTime_packed = performance.now()
	await asyncExec(`snarkjs groth16 setup ./.output/packed_subcircuit.r1cs ./pot23_final.ptau ./.output/main_packed0.zkey`,1)
	await asyncExec(`snarkjs zkey contribute ./.output/main_packed0.zkey ./.output/main_packed1.zkey --name=\"packed_key\" -v -e=\"pack\"`,1)
	await asyncExec(`snarkjs zkey export verificationkey ./.output/main_packed1.zkey ./.output/vkey_packed.json`,1)
	const endTime_packed = performance.now()

	//No pack
	const startTime_nopack = performance.now()
	await asyncExec(`snarkjs groth16 setup ./.output/nopack.r1cs ./pot23_final.ptau ./.output/nopack0.zkey`,1)
	await asyncExec(`snarkjs zkey contribute ./.output/nopack0.zkey ./.output/nopack1.zkey --name=\"nopack_key\" -v -e=\"nopack\"`,1)
	await asyncExec(`snarkjs zkey export verificationkey ./.output/nopack1.zkey ./.output/vkey_nopack.json`,1)
	const endTime_nopack = performance.now()

	
	console.log(`Setup (packed) took ${endTime_packed - startTime_packed} milliseconds`)
	console.log(`Setup (no pack) took ${endTime_nopack - startTime_nopack} milliseconds`)
}

async function generateWitness() {
	console.log('\x1b[32mGenerating witnesses... \x1b[0m')
	
	// //Packed version
	// const startTime_packed = performance.now()
	// await asyncExec(`make -C ./.output/main_packed_cpp/`)
    // await asyncExec(`./.output/main_packed_cpp/main_packed ./.output/input_packed.json ./.output/witness_packed.wtns`)
	// const endTime_packed = performance.now()
	// console.log(`Generating witness (packed) took ${endTime_packed - startTime_packed} milliseconds`)

	//No pack
	const startTime_nopack = performance.now()
	await asyncExec(`make -C ./.output/nopack_cpp/`)
    await asyncExec(`./.output/nopack_cpp/nopack ./.output/nopack_input.json ./.output/nopack_witness.wtns`)
	const endTime_nopack = performance.now()
	console.log(`Generating witness (no pack) took ${endTime_nopack - startTime_nopack} milliseconds`)
}

async function prove() {
	console.log('\x1b[32mProving... \x1b[0m')

	//Packed version
	const startTime_packed = performance.now()
	await asyncExec(`snarkjs groth16 prove ./.output/main_packed1.zkey ./.output/packed_witness.wtns ./.output/packed_proof.json ./.output/packed_public.json`,1)
	const endTime_packed = performance.now()
	console.log(`Proving (packed) took ${endTime_packed - startTime_packed} milliseconds`)

	//No pack
	const startTime_nopack = performance.now()
	await asyncExec(`snarkjs groth16 prove ./.output/nopack1.zkey ./.output/nopack_witness.wtns ./.output/nopack_proof.json ./.output/nopack_public.json`,1)
	const endTime_nopack = performance.now()
	console.log(`Proving (no pack) took ${endTime_nopack - startTime_nopack} milliseconds`)
}

async function verify() {
	console.log('\x1b[32mVerifying... \x1b[0m')

	//Packed version
	const startTime_packed = performance.now()
	await asyncExec(`snarkjs groth16 verify ./.output/vkey_packed.json ./.output/packed_proof.json ./.output/packed_public.json`,1)
	const endTime_packed = performance.now()
	console.log(`Verifying (packed) took ${endTime_packed - startTime_packed} milliseconds`)

	//No pack
	const startTime_nopack = performance.now()
	await asyncExec(`snarkjs groth16 verify ./.output/vkey_nopack.json ./.output/nopack_proof.json ./.output/nopack_public.json`,1)
	const endTime_nopack = performance.now()
	console.log(`Verifying (no pack) took ${endTime_nopack - startTime_nopack} milliseconds`)
}

async function main() {
	// Create ./.output/
	if (!existsSync(`./.output`)) {
		mkdirSync(`./.output`)
	}

	//Write input_nopack.json 
    console.log('\x1b[32mComputing input_nopack... \x1b[0m')
    writeFileSync(`./.output/nopack_input.json`, JSON.stringify(input_sha_nopack))

	await compile();
	await setup();
	await generateWitness();
	// await prove();
	// await verify();
}

main();