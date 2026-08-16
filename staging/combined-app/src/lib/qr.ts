import QRCode from 'qrcode'

export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 0,
    width: 512,
    color: {
      dark: '#111111',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  })
}
