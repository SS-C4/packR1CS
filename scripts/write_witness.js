import { Scalar } from "ffjavascript";
import { readFileSync, writeFileSync } from "fs";

const prime = new Uint32Array([
	0xF0000001, 0x43E1F593, 0x79B97091,	0x2833E848, 0x8181585D, 0xB85045B6,	0xE131A029, 0x30644E72
]);

// Using some code from the witness caluculator given by circom
/** Takes witness.json as input and outputs a witness.wtns file */
export async function witnessFromJSON(jsonpath, outpath) {
    let witness_array = [];
    const data = readFileSync(jsonpath, 'utf-8') 
    const obj = JSON.parse(data)
    Object.values(obj).forEach((item) => witness_array.push(Scalar.fromString(item)))

    const buff32 = new Uint32Array(witness_array.length*8 + 8 + 11);
    const buff = new Uint8Array( buff32.buffer);

    //"wtns"
    buff[0] = "w".charCodeAt(0)
    buff[1] = "t".charCodeAt(0)
    buff[2] = "n".charCodeAt(0)
    buff[3] = "s".charCodeAt(0)

    //version 2
    buff32[1] = 2;

    //number of sections: 2
    buff32[2] = 2;

    //id section 1
    buff32[3] = 1;

    const n8 = 8*4;
    //id section 1 length in 64bytes
    const idSection1length = 8 + n8;
    const idSection1lengthHex = idSection1length.toString(16);
    buff32[4] = parseInt(idSection1lengthHex.slice(0,8), 16);
    buff32[5] = parseInt(idSection1lengthHex.slice(8,16), 16);

    //this.n32
    buff32[6] = n8;

    //prime - copy from data
    var pos = 7;
    for (let i = 0; i < 8; i++) {
        buff32[pos+i] = prime[i];
    }

    pos += 8;

    // witness size
    buff32[pos] = witness_array.length;
    pos++;

    //id section 2
    buff32[pos] = 2;
    pos++;

    // section 2 length
    const idSection2length = 32*witness_array.length;
    const idSection2lengthHex = idSection2length.toString(16);
    buff32[pos] = parseInt(idSection2lengthHex.slice(0,8), 16);
    buff32[pos+1] = parseInt(idSection2lengthHex.slice(8,16), 16);

    pos += 2;
    for (let i = 0; i < witness_array.length; i++) {
        const witness = witness_array[i];
        const witnessHex = witness.toString(16);
        for (let j = 0; j < 8; j++) {
            buff32[pos+j] = parseInt(witnessHex.slice(j*8, (j+1)*8), 16);
        }
        pos += 8;
    }

    writeFileSync(outpath, buff32);
}
