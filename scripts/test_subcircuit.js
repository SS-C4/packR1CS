const fs = require("fs")
const { Scalar } = require("ffjavascript")
const { spawn } = require('child_process')

p = Scalar.fromString("21888242871839275222246405745257275088548364400416034343698204186575808495617")

// Input for AES
const input_aes = {
	"in": Array.from(Array(128).keys()).map(i => ((Math.random() < 0.5)?1:0).toString()),
	"ks": Array.from(Array(1920).keys()).map(i => ((Math.random() < 0.5)?1:0).toString())
}

const bigIntMax = (...args) => args.reduce((m, e) => e > m ? e : m);

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

// Check that all entries of the matrices are "small" in absolute value
async function r1cs_bound_check() {
    await asyncExec(`snarkjs r1cs export json ${__dirname}/.output/main_subcircuit.r1cs`)

    fs.readFile(`${__dirname}/.output/main_subcircuit.json`, 'utf-8', function(err, data){
        const obj = JSON.parse(data)
        
        var entries = new Set()
        for (const t1 of obj.constraints){
            for (const t2 of t1){
                Object.values(t2).forEach((item) => 
                    (Scalar.fromString(item) < p - Scalar.fromString(item)) 
                    ? entries.add(Scalar.fromString(item)) : entries.add(p - Scalar.fromString(item))
                )
            }
        }
        console.log(`Maximum R1CS entry is ${bigIntMax(...entries)}`)
    })
}

// Check that the generated witness values are "small"
async function witness_bound_check() {
    await asyncExec(`make -C ${__dirname}/.output/main_subcircuit_cpp/`)
    await asyncExec(`${__dirname}/.output/main_subcircuit_cpp/main_subcircuit ${__dirname}/.output/input.json ${__dirname}/.output/witness.wtns`)

    await asyncExec(`snarkjs wtns export json ${__dirname}/.output/witness.wtns -o \"./.output/witness.json\"`)

    fs.readFile(`${__dirname}/.output/witness.json`, 'utf-8', function(err, data){
        const obj = JSON.parse(data)

        var entries = new Set()
        Object.values(obj).forEach((item) => 
                    (Scalar.fromString(item) < p - Scalar.fromString(item)) 
                    ? entries.add(Scalar.fromString(item)) : entries.add(p - Scalar.fromString(item))
        )
        console.log(`Maximum witness value is ${bigIntMax(...entries)}`)
    })
}

async function main() {
    // Create ./.output/
    if (!fs.existsSync(`${__dirname}/.output`)) {
		fs.mkdirSync(`${__dirname}/.output`)
	}

    //Write input.json 
    console.log('\x1b[32mComputing input... \x1b[0m')
    fs.writeFileSync(`${__dirname}/.output/input.json`, JSON.stringify(input_aes))

    //Compile circuit (with --O1)
    console.log('\x1b[32mCompiling circuit... \x1b[0m')
    await asyncExec(`circom ${__dirname}/../circuits/main_subcircuit.circom --r1cs --c --sym --O1 -o \"${__dirname}/.output\"`,1)

    // Check the maximum absolute values of witness and R1CS matrices A,B,C
    process.stdout.write('\x1b[32mBounds:\x1b[0m\n')
    await r1cs_bound_check();
    await witness_bound_check();

}

main();