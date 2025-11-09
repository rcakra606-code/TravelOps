// generate-hash.js
import bcrypt from "bcryptjs";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("Masukkan password yang ingin di-hash: ", async (plain) => {
  try {
    const hash = await bcrypt.hash(plain, 10);
    console.log("\n🔐 Hash bcrypt hasil generate:");
    console.log(hash);
    console.log("\n💡 Gunakan hash ini untuk kolom `password` di tabel users.");
  } catch (err) {
    console.error("❌ Gagal generate hash:", err);
  } finally {
    rl.close();
  }
});
