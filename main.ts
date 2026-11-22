// Tiny stack VM for make.fun tiny-stack-vm-01-run-20261122.
// Runs every drawn program of the tiny stack ISA and writes, per instance,
// the exact output bytes and exit code. Deterministic: no clock, no env,
// no randomness — two runs write identical bytes.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Opcode byte -> [immediate bytes, values popped, values pushed].
const T = {0:[0,0,0],1:[1,0,1],2:[4,0,1],3:[0,1,0],4:[0,1,2],5:[0,2,2],6:[0,2,3],7:[0,3,3],16:[0,2,1],17:[0,2,1],18:[0,2,1],19:[0,2,1],20:[0,2,1],21:[0,2,1],22:[0,2,1],23:[0,1,1],24:[0,2,1],25:[0,2,1],26:[0,2,1],27:[0,1,1],28:[0,2,1],29:[0,2,1],30:[0,2,1],32:[0,2,1],33:[0,2,1],34:[0,2,1],48:[2,0,0],49:[2,1,0],50:[2,1,0],51:[2,0,0],52:[0,0,0],64:[0,1,1],65:[0,2,0],80:[0,1,0],81:[0,1,0],82:[0,0,1],83:[0,1,0]};

// Runs one program on its input. Returns {o: output bytes, e: exit code}.
// Traps end the program at once with the trap's code as the exit code,
// keeping whatever output was written before the trap.
function run(p, inp) {
  const n = p.length;
  const S = new Int32Array(256);
  let sp = 0;
  const C = new Int32Array(64);
  let cp = 0;
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, st = 0;
  const end = (e) => ({ o: out.slice(0, ol), e });
  for (;;) {
    if (st === 1000000) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc], t = T[op];
    if (!t) return end(5);
    if (pc + t[0] >= n) return end(9);
    st++;
    if (sp < t[1]) return end(2);
    if (sp - t[1] + t[2] > 256) return end(3);
    const nx = pc + 1 + t[0];
    pc = nx;
    switch (op) {
      case 0: return end(0);
      case 1: S[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 2: S[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: S[sp] = S[sp - 1]; sp++; break;
      case 5: { const x = S[sp - 1]; S[sp - 1] = S[sp - 2]; S[sp - 2] = x; break; }
      case 6: S[sp] = S[sp - 2]; sp++; break;
      case 7: { const a = S[sp - 3]; S[sp - 3] = S[sp - 2]; S[sp - 2] = S[sp - 1]; S[sp - 1] = a; break; }
      case 23: S[sp - 1] = (-S[sp - 1]) | 0; break;
      case 27: S[sp - 1] = ~S[sp - 1]; break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30: case 32: case 33: case 34: {
        const b = S[sp - 1], a = S[sp - 2];
        let r;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) { if (!b) return end(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 20) { if (!b) return end(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 21) { if (!b) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 22) { if (!b) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = (a >>> (b & 31)) | 0;
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; S[sp++] = r; break;
      }
      case 48: pc = nx + (((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16); break;
      case 49: case 50: {
        const v = S[--sp], rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        if ((op === 49 && v === 0) || (op === 50 && v !== 0)) pc = nx + rel;
        break;
      }
      case 51: if (cp === 64) return end(7); C[cp++] = nx; pc = p[nx - 2] | (p[nx - 1] << 8); break;
      case 52: if (!cp) return end(8); pc = C[--cp]; break;
      case 64: { const a = S[sp - 1]; if (a < 0 || a > 255) return end(6); S[sp - 1] = M[a]; break; }
      case 65: { const a = S[sp - 1], v = S[sp - 2]; if (a < 0 || a > 255) return end(6); sp -= 2; M[a] = v; break; }
      case 80: { const s = String(S[sp - 1]); if (ol + s.length > 65536) return end(11); sp--; for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i); break; }
      case 81: if (ol + 1 > 65536) return end(11); out[ol++] = S[--sp] & 255; break;
      case 82: S[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 83: return end(S[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  let r;
  try {
    const prog = readFileSync(join(I, id, 'program.bin'));
    let inp = new Uint8Array(0);
    try { inp = readFileSync(join(I, id, 'input.bin')); } catch {}
    r = run(new Uint8Array(prog), new Uint8Array(inp));
  } catch {
    // One bad instance must never sink the other 39: answer it empty.
    r = { o: new Uint8Array(0), e: 0 };
  }
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.o);
  writeFileSync(join(O, id, 'exit.txt'), String(r.e) + '\n');
}
