
let path = require('path');
let _crypto = require('crypto');

function _DecryptDBPassWord(encrypted, key, iv, tag) {
  console.log('encrypted', encrypted);
  console.log('key',  key);
  console.log('iv',  iv);
  console.log('tag', tag);

  const AES_GCM_TAG_LEN = key.length;

  // console.log('AES_GCM_TAG_LEN', AES_GCM_TAG_LEN);

  const decipher = _crypto.createDecipheriv(`aes-128-gcm`, Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  const decrypted = decipher.update(Buffer.from(encrypted, 'hex'), 'binary', 'utf8') + decipher.final('utf8');
  return decrypted;
}

let binding = require('node-gyp-build')(path.resolve(__dirname, '..'));
try {
  console.log(binding.DecryptDBPassWord('b3435dbd090a3ac3f45fdd3f747e3ffdddbe547d27cdac4e42957eac51afda156aabf881'));
} catch (e) {
  console.log('e', e);
}

try {
  console.log(binding.DecryptDBPassWord('26e8d80567bc3553f1660325a035c51a9942c25d5b83e736b761f5db4e8502321dc9cde1'));
} catch (e) {
  console.log('e', e);
}

