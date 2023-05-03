pragma circom 2.0.0;

include "./sha256/sha256.circom";

template Main(rep)
{
    signal input in[rep][128];
    signal output out[rep][256];

    component sha[rep];
    var i;
    for(i = 0; i < rep; i++){
        sha[i] = Sha256(128);
        
        sha[i].in <== in[i];
        sha[i].out ==> out[i];
    }
}

component main = Main(1);