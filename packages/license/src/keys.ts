/**
 * Public verification key for zilobase license tokens.
 *
 * The matching PRIVATE key is held only by the license issuer (the private
 * `license-gen` tool) and is NEVER committed. This is a development key —
 * replace it with the production public key before shipping releases, and store
 * the production private key in a secret manager / HSM.
 */
export const EMBEDDED_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAy4pAxmwh2rcmpCyABOFu6LPNUhBlcjXaqhg3cs8+myg=
-----END PUBLIC KEY-----
`;
