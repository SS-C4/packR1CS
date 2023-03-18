const { readR1cs, writeR1cs } = require("r1csfile");
const { F1Field, Scalar } = require("ffjavascript");
const fs = require("fs");
const { assert } = require("console");

// Fixed constants
const pf = 11;
const sec_lambda = 80;
const reps = 10;
const poso_bound = 23 + 93;
const pi = [263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317];

//q is bigint product of elements in pi
const q = BigInt(263n * 269n * 271n * 277n * 281n * 283n * 293n * 307n * 311n * 313n * 317n);
assert (q < 2**93);

//Prime p
const minus_one = Scalar.fromString("21888242871839275222246405745257275088548364400416034343698204186575808495616");

//Reads the r1cs file and the sym file of the subcircuit
async function read_files() {
    const r1cs = await readR1cs("./.output/../ex.r1cs",{
        loadConstraints: true,
        loadMap: true,
        getFieldFromPrime: (p, singlethread) => new F1Field(p)
    });
    
    const symsStr = await fs.promises.readFile("./.output/../ex.sym","utf8");
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

async function pack_witness(r1cs, symbols) {

}

async function main() {
    const [r1, sym1] = await read_files();

    const [r2, sym2] = await add_k(r1, sym1);
    const [r3, sym3] = await add_poso(r2, sym2);



    //Write new R1CS file and symbols to mod_subcircuit
    // await writeR1cs("./.output/mod_subcircuit.r1cs", r3);

}

main();