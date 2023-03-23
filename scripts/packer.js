import { readR1cs, writeR1cs } from "r1csfile";
import { F1Field, Scalar, buildBn128 } from "ffjavascript";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { assert } from "console";
import { modInv } from 'bigint-mod-arith';
import { spawn } from 'child_process';
import { witnessFromJSON } from "./write_witness.js";

// Fixed constants
const pf = 11;
const sec_lambda = 80;
const reps = 10;
const poso_bound = 23 + 93;
const pi = [263n, 269n, 271n, 277n, 281n, 283n, 293n, 307n, 311n, 313n, 317n];

//q is bigint product of elements in pi
const q = BigInt(263n * 269n * 271n * 277n * 281n * 283n * 293n * 307n * 311n * 313n * 317n);
assert (q < 2**93);

//Prime p
const p = Scalar.fromString("21888242871839275222246405745257275088548364400416034343698204186575808495617");
const minus_one = Scalar.fromString("21888242871839275222246405745257275088548364400416034343698204186575808495616");

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

/** Reads the r1cs file and the sym file of the subcircuit */
async function read_files() {
    if (!existsSync("./.output/subcircuit.r1cs") || !existsSync("./.output/subcircuit.sym")) {
        console.log("Compile subcircuit first");
        return [null, null];
    }

    const r1cs = await readR1cs("./.output/subcircuit.r1cs",{
        loadConstraints: true,
        loadMap: true,
        getFieldFromPrime: (p, singlethread) => new F1Field(p)
    });
    
    const symsStr = await readFileSync("./.output/subcircuit.sym","utf8");
    const lines = symsStr.split("\n");

    let symbols = {};
    for (let i=0; i<lines.length; i++) {
        const arr = lines[i].split(",");
        if (arr.length!=4) continue;
        symbols[arr[3]] = {
            labelIdx: Number(arr[0]),
            varIdx: Number(arr[1]),
            componentIdx: Number(arr[2]),
        };
    }

    return [r1cs, symbols];
}

/** Generates random inputs and computes witnesses for "pf" subcircuits */
async function get_input_witness() {
    let input_array = [];
    for (let i = 0; i < pf; i++) {
        input_array[i] = {
        "in": Array.from(Array(128).keys()).map(i => ((Math.random() < 0.5)?1:0).toString()),
        "ks": Array.from(Array(1920).keys()).map(i => ((Math.random() < 0.5)?1:0).toString())
        };
    }

    let witness_array = Array.from(Array(pf), () => []);

    for (let i = 0; i < pf; i++) {
        writeFileSync(`./.output/input${i}.json`, JSON.stringify(input_array[i]));
        
        await asyncExec(`./.output/subcircuit_cpp/subcircuit ./.output/input${i}.json ./.output/witness${i}.wtns`);
        await asyncExec(`snarkjs wtns export json ./.output/witness${i}.wtns -o \"./.output/witness${i}.json\"`);

        const data = readFileSync(`./.output/witness${i}.json`, 'utf-8') 
        const obj = JSON.parse(data)
        Object.values(obj).forEach((item) => witness_array[i].push(Scalar.fromString(item)))
    }

    return [input_array, witness_array];
}

/** Chinese Remainder Theorem map */
function crt_map(rem_arr, mod_arr = pi) {
    return mod_arr.reduce((sum, mod, index) => {
        const p = q / mod;
        return sum + (rem_arr[index] * modInv(p, mod) * p);
    }, 0n) % q;
}

/** Checks if the constraint system is satisfied */
async function check_r1cs(r1cs, witness) {
    const F = r1cs.F;

    for (const t1 of r1cs.constraints) {
        const a = evalLC(t1[0]);
        const b = evalLC(t1[1]);
        const c = evalLC(t1[2]);
        assert (F.isZero(F.sub(F.mul(a,b), c)), `Oops ${a} ${b} ${c}`);
    }

    function evalLC(lc) {
        let v = F.zero;
        for (let w in lc) {
            v = F.add(
                v,
                F.mul( lc[w], witness[w])
            );
        }
        return v;
    }
}

/** Main packing function */
async function pack(r1cs, symbols) {
    //Get the inputs and witnesses for each of the "pf" subcircuits
    const [inp_arr, wit_arr] = await get_input_witness();

    //Pack the inputs and witnesses for just the subcircuit
    const packed_input = {
        "in": [],
        "ks": []
    };

    for(let i = 0; i < 128; i++){
        let tmp_arr = [];

        for (let j = 0; j < pf; j++)
            tmp_arr[j] = BigInt(inp_arr[j]["in"][i]);

        packed_input["in"].push(crt_map(tmp_arr));
    }
    for(let i = 0; i < 1920; i++){
        let tmp_arr = [];

        for (let j = 0; j < pf; j++)
            tmp_arr[j] = BigInt(inp_arr[j]["ks"][i]);

        packed_input["ks"].push(crt_map(tmp_arr));
    }

    let packed_witness = [];

    for(let i = 0; i < wit_arr[0].length; i++){
        let tmp_arr = [];

        for (let j = 0; j < pf; j++)
            tmp_arr[j] = BigInt(wit_arr[j][i]);

        packed_witness.push(crt_map(tmp_arr));
    }

    //Add the extra constraints and witness variables to the R1CS and symbol file
    //Simultaneously, add extra witnesses
    const F = r1cs.F;

    //Function to evaluate a linear combination
    function evalLC(lc) {
        let v = F.zero;
        for (let w in lc) {
            v = F.add(
                v,
                F.mul( lc[w], packed_witness[w] )
            );
        }
        return v;
    }

    //Add the extra k's
    var counter = 0;
    for (const t1 of r1cs.constraints) {
        //Compute k
        const a = evalLC(t1[0]);
        const b = evalLC(t1[1]);
        const c = evalLC(t1[2]);

        const kq = F.sub(F.mul(a,b), c);
        assert (kq % q == 0n || (p-kq) % q == 0n, "oh no");

        //Put the correct positive or negative coefficient for k
        if (kq % q == 0n) {
            t1[2][(counter + r1cs.nVars).toString()] = q;    
            const k = kq / q;
            assert(k*q == kq, "huh");
            packed_witness.push(k);
        }
        else {
            t1[2][(counter + r1cs.nVars).toString()] = (minus_one * q) % p;
            const k = (p - kq) / q; 
            assert(k*q == (p - kq), `huuh ${kq}`);
            packed_witness.push(k);
        }

        symbols["k[" + (counter).toString() + "]"] = {labelIdx: counter + r1cs.nLabels, varIdx: r1cs.nVars + counter, componentIdx: 6};     
        r1cs.map[counter + r1cs.nVars] = counter + r1cs.nLabels;

        counter++;
    }

    r1cs.nLabels += counter;
    r1cs.nVars += counter;

    let sum = new Array(reps);

    //Add PoSO constraints and witnesses
    for (let i = 0; i < reps; i++) {
        let tc = [{},{},{}];
        tc[2][(r1cs.nVars + i*(poso_bound+1)).toString()] = minus_one;
        
        sum[i] = 0n;
        for (let j = 0; j < r1cs.nVars; j++) {
            tc[2][(j).toString()] = BigInt(Math.round(Math.random() * 2**8));

            //Add the PoSO sum to packed witness
            sum[i] += tc[2][(j).toString()] * packed_witness[j];
        }

        r1cs.constraints.push(tc);
        symbols["PoSO[" + (i).toString() + "]"] = {labelIdx: r1cs.nLabels + i*(poso_bound+1), varIdx: r1cs.nVars + i*(poso_bound+1), componentIdx: 6};
        r1cs.map[r1cs.nVars + i*(poso_bound+1)] = r1cs.nLabels + i*(poso_bound+1);
    }

    //Add Bit decomposition constraints and witnesses
    for (let i = 0; i < reps; i++) {
        //Add PoSO sum to packed witness
        packed_witness.push(sum[i]);

        for (let j = 1; j <= poso_bound; j++) {
            let tc = [{},{},{}];

            tc[0]["0"] = minus_one;
            tc[0][(r1cs.nVars + i*(poso_bound+1) + j).toString()] = 1n;
            tc[1][(r1cs.nVars + i*(poso_bound+1) + j).toString()] = 1n;

            //Compute bit decomposition of PoSO value and add to packed witness 
            packed_witness.push((sum[i] >> BigInt(j-1)) & 1n);
            
            r1cs.constraints.push(tc);
            symbols["PoSO.Bits[" + (i).toString() + "][" + (j).toString() + "]"] = {labelIdx: r1cs.nLabels + i*(poso_bound+1) + j, varIdx: r1cs.nVars + i*(poso_bound+1) + j, componentIdx: 6};
            r1cs.map[r1cs.nVars + i*(poso_bound+1) + j] = r1cs.nLabels + i*(poso_bound+1) + j;
        }
    }

    //Add recomposition constraints
    for (let i = 0; i < reps; i++) {
        let tc = [{},{},{}];
        tc[2][(r1cs.nVars + i*(poso_bound+1)).toString()] = minus_one;
        for (let j = 1; j <= poso_bound; j++) {
            tc[2][(r1cs.nVars + i*(poso_bound+1) + j).toString()] = BigInt(2**(j-1));
        }            
        r1cs.constraints.push(tc);
    }

    r1cs.nConstraints += reps*(1 + poso_bound + 1);
    r1cs.nLabels += reps*(poso_bound + 1);
    r1cs.nVars += reps*(poso_bound + 1);    
    
    await check_r1cs(r1cs, packed_witness);

    const curve = await buildBn128();
    let packed_input_string = {
        in: stringifyBigIntsWithField(curve.Fr, packed_input["in"]),
        ks: stringifyBigIntsWithField(curve.Fr, packed_input["ks"])
    };

    //Write files
    writeFileSync(`./.output/packed_input.json`, JSON.stringify(packed_input_string));
    writeFileSync(`./.output/packed_witness.json`, JSON.stringify(stringifyBigIntsWithField(curve.Fr, packed_witness)));

    await writeR1cs("./.output/packed_subcircuit.r1cs", r1cs);
    await witnessFromJSON("./.output/packed_witness.json", "./.output/packed_witness.wtns");
}

function stringifyBigIntsWithField(Fr, o) {
    if (o instanceof Uint8Array)  {
        return Fr.toString(o);
    } else if (Array.isArray(o)) {
        return o.map(stringifyBigIntsWithField.bind(null, Fr));
    } else if (typeof o == "object") {
        const res = {};
        const keys = Object.keys(o);
        keys.forEach( (k) => {
            res[k] = stringifyBigIntsWithField(Fr, o[k]);
        });
        return res;
    } else if ((typeof(o) == "bigint") || o.eq !== undefined)  {
        return o.toString(10);
    } else {
        return o;
    }
}

async function main() {
    const [r1, sym1] = await read_files();
    await pack(r1,sym1);

    console.log("\x1b[32mDONE\x1b[0m");
}

main();