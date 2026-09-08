// src/api/updateCertificate.js




export async function updateCertificate({ accessToken, certificateId, payload }) {
  const response = await fetch(`/api/certificates/${certificateId}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.detail || 'Failed to update draft.')
  }

  return await response.json()
}