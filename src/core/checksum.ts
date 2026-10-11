/** Anki note checksum: first 4 bytes of SHA-1 over the sort-field's UTF-8 bytes. */
export function ankiChecksum(text: string): number {
  const data = new TextEncoder().encode(text);
  const count = Math.ceil((data.length + 9) / 64) * 64;
  const bytes = new Uint8Array(count);
  bytes.set(data); bytes[data.length] = 0x80;
  const bitLength = data.length * 8;
  const view = new DataView(bytes.buffer);
  view.setUint32(count - 8, Math.floor(bitLength / 2 ** 32), false);
  view.setUint32(count - 4, bitLength >>> 0, false);
  let a = 0x67452301,b = 0xefcdab89,c = 0x98badcfe,d = 0x10325476,e = 0xc3d2e1f0;
  const rol = (x:number,n:number) => (x << n) | (x >>> (32-n));
  for(let start=0;start<count;start+=64){
    const w = new Int32Array(80);
    for(let i=0;i<16;i++)w[i]=view.getInt32(start+i*4,false);
    for(let i=16;i<80;i++)w[i]=rol(w[i-3]^w[i-8]^w[i-14]^w[i-16],1);
    let aa=a,bb=b,cc=c,dd=d,ee=e;
    for(let i=0;i<80;i++){
      let f:number,k:number;
      if(i<20){f=(bb&cc)|(~bb&dd);k=0x5a827999;}
      else if(i<40){f=bb^cc^dd;k=0x6ed9eba1;}
      else if(i<60){f=(bb&cc)|(bb&dd)|(cc&dd);k=0x8f1bbcdc;}
      else {f=bb^cc^dd;k=0xca62c1d6;}
      const tmp=(rol(aa,5)+f+ee+k+w[i])|0;
      ee=dd;dd=cc;cc=rol(bb,30);bb=aa;aa=tmp;
    }
    a=(a+aa)|0;b=(b+bb)|0;c=(c+cc)|0;d=(d+dd)|0;e=(e+ee)|0;
  }
  return a >>> 0;
}
