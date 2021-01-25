{
  "targets": [
    {
      "target_name": "cppdalset",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [ "cppmodules/node-aes-gcm.cc", "cppmodules/cppdalset.cc" ],
      "include_dirs": [
        "<(node_root_dir)/deps/openssl/openssl/include",
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
    }
  ]
}
