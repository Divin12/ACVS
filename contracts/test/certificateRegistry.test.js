const CertificateRegistry = artifacts.require("CertificateRegistry");

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const CERT_ID = "0x1111111111111111111111111111111111111111111111111111111111111111";
const HASH = "0x2222222222222222222222222222222222222222222222222222222222222222";
const UNKNOWN_CERT_ID = "0x3333333333333333333333333333333333333333333333333333333333333333";

async function expectRevert(promise, message) {
  let reverted = false;
  try {
    await promise;
  } catch (err) {
    reverted = true;
    if (message && !err.message.includes(message)) {
      throw new Error(`Expected revert containing "${message}" but got: ${err.message}`);
    }
  }
  assert.isTrue(reverted, "Expected transaction to revert");
}

contract("CertificateRegistry", () => {
  let registry;

  beforeEach(async () => {
    registry = await CertificateRegistry.new();
  });

  it("anchors a certificate and emits CertificateAnchored", async () => {
    const receipt = await registry.anchorCertificate(CERT_ID, HASH);

    assert.equal(receipt.logs.length, 1);
    assert.equal(receipt.logs[0].event, "CertificateAnchored");
    assert.equal(receipt.logs[0].args.certificateId, CERT_ID);
    assert.equal(receipt.logs[0].args.hash, HASH);

    const stored = await registry.getCertificate(CERT_ID);
    assert.equal(stored.hash, HASH);
    assert.equal(stored.disabled, false);
    assert.equal(stored.anchored, true);
  });

  it("rejects anchoring the same certificate ID twice", async () => {
    await registry.anchorCertificate(CERT_ID, HASH);
    await expectRevert(
      registry.anchorCertificate(CERT_ID, HASH),
      "CertificateRegistry: already anchored",
    );
  });

  it("disables an anchored certificate without deleting the hash", async () => {
    await registry.anchorCertificate(CERT_ID, HASH);
    const receipt = await registry.disableCertificate(CERT_ID);

    assert.equal(receipt.logs.length, 1);
    assert.equal(receipt.logs[0].event, "CertificateDisabled");
    assert.equal(receipt.logs[0].args.certificateId, CERT_ID);

    const stored = await registry.getCertificate(CERT_ID);
    assert.equal(stored.hash, HASH);
    assert.equal(stored.disabled, true);
    assert.equal(stored.anchored, true);
  });

  it("rejects disabling a certificate that was never anchored", async () => {
    await expectRevert(
      registry.disableCertificate(UNKNOWN_CERT_ID),
      "CertificateRegistry: not anchored",
    );
  });

  it("rejects disabling a certificate that is already disabled", async () => {
    await registry.anchorCertificate(CERT_ID, HASH);
    await registry.disableCertificate(CERT_ID);
    await expectRevert(
      registry.disableCertificate(CERT_ID),
      "CertificateRegistry: already disabled",
    );
  });

  it("returns zero values for a never-anchored certificate", async () => {
    const stored = await registry.getCertificate(UNKNOWN_CERT_ID);
    assert.equal(stored.hash, ZERO_BYTES32);
    assert.equal(stored.disabled, false);
    assert.equal(stored.anchored, false);
  });
});
