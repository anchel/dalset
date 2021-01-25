#include <string>
#include <napi.h>
#include <openssl/evp.h>

char const hex[16] = { '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A',   'B','C','D','E','F'};

std::string GcmDecrypt(std::string &key, std::string &iv, std::string &str, std::string &aad, std::string &tag);

std::string str_2_hex(const char* bytes, int size) {
  std::string str;
  for (int i = 0; i < size; ++i) {
    const char ch = bytes[i];
    str.append(&hex[(ch  & 0xF0) >> 4], 1);
    str.append(&hex[ch & 0xF], 1);
  }
  return str;
}

void HexStr2Bin(const char* pszHexStr, char *pszBinData, uint32_t& dwBinLength)
{
    uint32_t dwHexStrLength = strlen(pszHexStr);
//    printf("dwHexStrLength: %d\n", dwHexStrLength);

    char szTmpdata[3];
    uint32_t dwRealLength = dwHexStrLength / 2;
    for (uint32_t i = 0 ; i < dwRealLength ; i++)
    {
        szTmpdata[0] = pszHexStr[i*2];
        szTmpdata[1] = pszHexStr[i*2+1];
        szTmpdata[2] = 0;
        pszBinData[i] = (unsigned char)strtol(szTmpdata, NULL, 16);
    }

    dwBinLength = dwRealLength;
}

Napi::Value Method(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string strKey = std::string("abced");

//  if (info.Length() < 2) {
//    Napi::TypeError::New(env, "Wrong number of arguments")
//        .ThrowAsJavaScriptException();
//    return env.Null();
//  }
//
//  if (!info[0].IsString() || !info[1].IsFunction()) {
//    Napi::TypeError::New(env, "Wrong arguments").ThrowAsJavaScriptException();
//    return env.Null();
//  }

  Napi::String password = info[0].As<Napi::String>();

  std::string strPassword = password.Utf8Value();

  if (strPassword.size() > (4096 * 2)) {
    Napi::TypeError::New(env, "the length of password can not > 4096").ThrowAsJavaScriptException();
    return env.Null();
  }
  if (strPassword.size() < (28 * 2)) {
    Napi::TypeError::New(env, "the length of password can not < 56").ThrowAsJavaScriptException();
    return env.Null();
  }

  uint32_t AES_GCM_TAG_LEN = 16;

  unsigned char szBin[4096 * 2] = {0};
  uint32_t dwBinLen = sizeof(szBin);

  // key to hex
  std::string strHexKey = str_2_hex(strKey.c_str(), strKey.size());

  // hex to str
  HexStr2Bin(strPassword.c_str(), (char *)szBin, dwBinLen);

  std::string purepwd = std::string((char*)szBin, dwBinLen - 28);
  std::string iv_tag  = std::string((char*)szBin + dwBinLen - 28, 28);
  std::string tag = iv_tag.substr(0, AES_GCM_TAG_LEN);
  std::string iv = iv_tag.substr(AES_GCM_TAG_LEN);
  std::string aad = std::string("");

//  std::string iv_tag_hex = str_2_hex((char*)szBin + dwBinLen - 28, 28);
//  std::string tag_hex = iv_tag_hex.substr(0, AES_GCM_TAG_LEN * 2);
//  std::string iv_hex = iv_tag_hex.substr(AES_GCM_TAG_LEN * 2);
//  std::string purehexpwd = str_2_hex((char*)szBin, dwBinLen - 28);

//  Napi::String napiKey =        Napi::String::New(env, strHexKey);
//  Napi::String napiHexPurepwd = Napi::String::New(env, purehexpwd);
//  Napi::String napiIv =         Napi::String::New(env, iv);
//  Napi::String napiTag =        Napi::String::New(env, tag);

  std::string dret = GcmDecrypt(strKey, iv, purepwd, aad, tag);

//  printf("dret: %s\n", dret.c_str());

  return Napi::String::New(env, dret);
//  Napi::Function cb = info[1].As<Napi::Function>();

//  return cb.Call(env.Global(), {napiHexPurepwd, napiKey, napiIv, napiTag});
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "DecryptDBPassWord"),
              Napi::Function::New(env, Method));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
