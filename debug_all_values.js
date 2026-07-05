const envs = process.env;
const sanitized = {};
for (const key in envs) {
  const val = envs[key];
  if (val && val.length > 5) {
    sanitized[key] = val.substring(0, 3) + '...' + val.substring(val.length - 3);
  } else {
    sanitized[key] = val;
  }
}
console.log(JSON.stringify(sanitized, null, 2));
