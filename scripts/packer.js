const { readR1cs, writeR1cs } = require("r1csfile");
const { F1Field, Scalar } = require("ffjavascript");
const fs = require("fs");
const { assert, time } = require("console");
const bigintModArith = require('bigint-mod-arith')
const { spawn } = require('child_process')


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

//Reads the r1cs file and the sym file of the subcircuit
async function read_files() {
    if (!fs.existsSync("./.output/subcircuit.r1cs") || !fs.existsSync("./.output/subcircuit.sym")) {
        console.log("Compile subcircuit first");
        return [null, null];
    }

    const r1cs = await readR1cs("./.output/subcircuit.r1cs",{
        loadConstraints: true,
        loadMap: true,
        getFieldFromPrime: (p, singlethread) => new F1Field(p)
    });
    
    const symsStr = await fs.readFileSync("./.output/subcircuit.sym","utf8");
    const lines = symsStr.split("\n");

    symbols = {};
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
        fs.writeFileSync(`${__dirname}/.output/input${i}.json`, JSON.stringify(input_array[i]));
        
        await asyncExec(`${__dirname}/.output/subcircuit_cpp/subcircuit ${__dirname}/.output/input${i}.json ${__dirname}/.output/witness${i}.wtns`);
        await asyncExec(`snarkjs wtns export json ${__dirname}/.output/witness${i}.wtns -o \"./.output/witness${i}.json\"`);

        const data = fs.readFileSync(`${__dirname}/.output/witness${i}.json`, 'utf-8') 
        const obj = JSON.parse(data)
        Object.values(obj).forEach((item) => witness_array[i].push(Scalar.fromString(item)))
    }

    return [input_array, witness_array];
}


function crt_map(rem_arr, mod_arr = pi){
    return mod_arr.reduce((sum, mod, index) => {
        const p = q / mod;
        return sum + (rem_arr[index] * bigintModArith.modInv(p, mod) * p);
    }, 0n) % q;
}

async function pack_input_witness() {
    const [inp_arr, wit_arr] = await get_input_witness();
    var i,j;

    const packed_input = {
        "in": [],
        "ks": []
    };

    for(i = 0; i < 128; i++){
        let tmp_arr = [];

        for (j = 0; j < pf; j++)
            tmp_arr[j] = BigInt(inp_arr[j]["in"][i]);

        packed_input["in"].push(crt_map(tmp_arr));
    }
    for(i = 0; i < 1920; i++){
        let tmp_arr = [];

        for (j = 0; j < pf; j++)
            tmp_arr[j] = BigInt(inp_arr[j]["ks"][i]);

        packed_input["ks"].push(crt_map(tmp_arr));
    }

    let packed_witness = [];

    for(i = 0; i < wit_arr[0].length; i++){
        let tmp_arr = [];

        for (j = 0; j < pf; j++)
            tmp_arr[j] = BigInt(wit_arr[j][i]);

        packed_witness.push(crt_map(tmp_arr));
    }

    return [packed_input, packed_witness]
}

async function write_packed(r1cs){
    [packed_input, packed_witness] = await pack_input_witness();

    const [oldr1cs, oldsymbols] = await read_files();

    const F = r1cs.F;

    for (const t1 of oldr1cs.constraints) {
        const a = evalLC(t1[0]);
        const b = evalLC(t1[1]);
        const c = evalLC(t1[2]);

        const kq = F.sub(F.mul(a,b), c);
        // console.log(kq);
        assert (kq % q == 0n || (p-kq) % q == 0n);
        const k = (kq % q == 0n) ? (kq / q) : ((p-kq) / q);
        // console.log(t1);

        packed_witness.push(k);
    }

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
    

    //Add PoSO values

    //Add PoSO bit values

    // fs.writeFileSync(`${__dirname}/.output/packed_input.json`, JSON.stringify(packed_input));
    // fs.writeFileSync(`${__dirname}/.output/packed_witness.json`, JSON.stringify(packed_witness));
}

async function add_k(r1cs, symbols) {    
    counter = 0;
    
    for (const t1 of r1cs.constraints) {
        t1[2][(counter + r1cs.nLabels).toString()] = q;
        symbols["k[" + (counter).toString() + "]"] = {labelIdx: counter + r1cs.nLabels, varIdx: r1cs.nVars + counter, componentIdx: 6};
        counter++;
    }

    r1cs.nLabels += counter;
    r1cs.nVars += counter;

    return [r1cs, symbols];
}

async function add_poso(r1cs, symbols) {

    // PoSO constraints
    for (let i = 0; i < reps; i++) {
        let tc = [{},{},{}];
        tc[2][(r1cs.nLabels + i*(poso_bound+1)).toString()] = minus_one;
        
        for (let j = 0; j < r1cs.nVars; j++) {
            tc[2][(j).toString()] = Math.round(Math.random() * 2**8);
        }

        r1cs.constraints.push(tc);
        symbols["PoSO[" + (i).toString() + "]"] = {labelIdx: r1cs.nLabels + i*(poso_bound+1), varIdx: r1cs.nVars + i*(poso_bound+1), componentIdx: 6};
    }

    // Bit decomposition constraints
    for (let i = 0; i < reps; i++) {
        for (let j = 1; j <= poso_bound; j++) {
            let tc = [{},{},{}];

            tc[0]["0"] = minus_one;
            tc[0][(r1cs.nLabels + i*(poso_bound+1) + j).toString()] = 1n;
            tc[1][(r1cs.nLabels + i*(poso_bound+1) + j).toString()] = 1n;
            
            r1cs.constraints.push(tc);
            symbols["PoSO.Bits[" + (i).toString() + "][" + (j).toString() + "]"] = {labelIdx: r1cs.nLabels + i*(poso_bound+1) + j, varIdx: r1cs.nVars + i*(poso_bound+1) + j, componentIdx: 6};
        }
    }

    // Recombination constraints
    for (let i = 0; i < reps; i++) {
        let tc = [{},{},{}];
        tc[2][(r1cs.nLabels + i*(poso_bound+1)).toString()] = minus_one;
        for (let j = 1; j <= poso_bound; j++) {
            tc[2][(r1cs.nLabels + i*(poso_bound+1) + j).toString()] = BigInt(2**(j-1));
        }            
        r1cs.constraints.push(tc);
    }

    r1cs.nConstraints += reps*(1 + poso_bound + 1);
    r1cs.nLabels += reps*(poso_bound + 1);
    r1cs.nVars += reps*(poso_bound + 1);

    return [r1cs, symbols];
}

async function main() {
    const [r1, sym1] = await read_files();

    const [r2, sym2] = await add_k(r1, sym1);
    const [r3, sym3] = await add_poso(r2, sym2);

    await write_packed(r3);

    // Write r1cs, symbols, packed input and witness
    // TODO 
    // write_input_witness(packed_input, packed_witness);

}

main();