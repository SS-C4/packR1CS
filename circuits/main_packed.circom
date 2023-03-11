pragma circom 2.0.0;

include "./aes/aes_256_encrypt.circom";

template Main(rep)
{
    signal input in[rep][128];
    signal input ks[rep][1920];
    signal output out[rep][128];

    component aes[rep];
    var i;
    for(i = 0; i < rep; i++){
        aes[i] = AES256Encrypt();
        
        aes[i].in <== in[i];
        aes[i].ks <== ks[i];
        aes[i].out ==> out[i];
    }
}

component main = Main(250);
