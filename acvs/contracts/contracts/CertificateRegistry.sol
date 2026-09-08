// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CertificateRegistry
/// @notice Minimal registry that anchors certificate hashes and can flag them as disabled.
/// @dev State-changing functions carry a basic reentrancy guard. The contract intentionally
///      has no access control of its own — gating is handled by the calling layer
///      (Django/frontend) in a later phase.
contract CertificateRegistry {
    struct Certificate {
        bytes32 hash;
        bool disabled;
        bool anchored;
    }

    mapping(bytes32 => Certificate) private _certificates;

    // Reentrancy guard state (OpenZeppelin-style mutex).
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _reentrancyStatus = _NOT_ENTERED;

    event CertificateAnchored(bytes32 indexed certificateId, bytes32 hash);
    event CertificateDisabled(bytes32 indexed certificateId);

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "CertificateRegistry: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    /// @notice Anchor a certificate hash against a unique certificate ID.
    /// @dev Reverts if the certificate ID has already been anchored.
    /// @param certificateId Unique identifier for the certificate.
    /// @param hash         Hash being anchored (e.g. SHA-256 of the certificate).
    function anchorCertificate(bytes32 certificateId, bytes32 hash) external nonReentrant {
        require(!_certificates[certificateId].anchored, "CertificateRegistry: already anchored");
        _certificates[certificateId] = Certificate({hash: hash, disabled: false, anchored: true});
        emit CertificateAnchored(certificateId, hash);
    }

    /// @notice Flag an anchored certificate as disabled.
    /// @dev Does not delete the record. Reverts if the certificate was never anchored
    ///      or has already been disabled.
    /// @param certificateId The certificate to disable.
    function disableCertificate(bytes32 certificateId) external nonReentrant {
        Certificate storage cert = _certificates[certificateId];
        require(cert.anchored, "CertificateRegistry: not anchored");
        require(!cert.disabled, "CertificateRegistry: already disabled");
        cert.disabled = true;
        emit CertificateDisabled(certificateId);
    }

    /// @notice Read the anchored hash and disabled status for a certificate.
    /// @param certificateId The certificate to look up.
    /// @return hash     Anchored hash (zero if the certificate was never anchored).
    /// @return disabled True if the certificate has been disabled.
    /// @return anchored True if the certificate has been anchored.
    function getCertificate(bytes32 certificateId)
        external
        view
        returns (bytes32 hash, bool disabled, bool anchored)
    {
        Certificate storage cert = _certificates[certificateId];
        return (cert.hash, cert.disabled, cert.anchored);
    }
}
