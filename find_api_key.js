const envs = process.env;
for (const key in envs) {
  if (envs[key] && envs[key].startsWith('AIza')) {
    console.log('Found potential Google API key in:', key);
  }
}
