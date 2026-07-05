import { getAdminDB } from './dist/server.cjs'; 

async function run() {
  const db = getAdminDB(); // We just need something to fetch DB... wait! getAdminDB is not exported in CJS? Let's just use the source code.
}
