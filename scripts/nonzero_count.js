import { spawn } from 'child_process';
import { readR1cs } from "r1csfile";
import { F1Field } from "ffjavascript";

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

/** Counts the number of non-zero entries in the input R1CS file */
async function nonzero_count(file_name) {
    const r1cs = await readR1cs(file_name,{
        loadConstraints: true,
        loadMap: true,
        getFieldFromPrime: (p, singlethread) => new F1Field(p)
    });

    // Matrix A
    let na = 0;
    for (const t1 of r1cs.constraints) {
        na += Object.keys(t1[0]).length;
    } 

    // Matrix B
    let nb = 0;
    for (const t1 of r1cs.constraints) {
        nb += Object.keys(t1[1]).length;
    }

    // Matrix C
    let nc = 0;
    for (const t1 of r1cs.constraints) {
        nc += Object.keys(t1[2]).length;
    }

    console.log(`nConstraints: ${r1cs.nConstraints}, nVars: ${r1cs.nVars}, nz_A: ${na}, nz_B: ${nb}, nz_C: ${nc}, total_nz: ${na+nb+nc}`);
}

async function main() {
    await nonzero_count("./.output/subcircuit.r1cs");
    await nonzero_count("./.output/nopack.r1cs");
    await nonzero_count("./.output/packed_subcircuit.r1cs");
}

main();