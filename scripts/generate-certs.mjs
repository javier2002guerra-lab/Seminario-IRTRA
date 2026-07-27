import fs from "node:fs";
import forge from "node-forge";
fs.mkdirSync("certs", { recursive: true });
const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = Date.now().toString(16);
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date(Date.now() + 3650 * 86400000);
const attrs = [
  { name: "commonName", value: "localhost" },
  { name: "organizationName", value: "IRTRA" },
];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.setExtensions([
  { name: "basicConstraints", cA: true },
  {
    name: "subjectAltName",
    altNames: [
      { type: 2, value: "localhost" },
      { type: 7, ip: "127.0.0.1" },
    ],
  },
]);
cert.sign(keys.privateKey, forge.md.sha256.create());
fs.writeFileSync(
  "certs/localhost-key.pem",
  forge.pki.privateKeyToPem(keys.privateKey),
);
fs.writeFileSync("certs/localhost.pem", forge.pki.certificateToPem(cert));
console.log("Certificado local generado en certs/.");
