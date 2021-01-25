module.exports = {
    root: true,
    extends: ['airbnb-typescript'],
    env: {
        node: true
    },
    rules: {
        'linebreak-style': 'off',
        'max-len': ['warn', {'code': 256}],
        'camelcase': ['error', {'allow': ['^m_']}],
        'no-underscore-dangle': "off",
        'no-param-reassign': ['error', {'props': false}],
        'no-restricted-syntax': 'off',
        '@typescript-eslint/no-this-alias': [
            "error",
            {
                "allowDestructuring": true, // Allow `const { props, state } = this`; false by default
                "allowedNames": ['self', 'that'] // Allow `const self = this`; `[]` by default
            }
        ],
        '@typescript-eslint/member-ordering': ['off'],
        '@typescript-eslint/prefer-optional-chain': 'off',
    }
}
