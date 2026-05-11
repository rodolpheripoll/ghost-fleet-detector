import path from 'path'
import fs   from 'fs'

/**
 * GET /api/download-report
 * Serve the pre-generated PDF from outputs/rapport_flotte_fantome.pdf.
 * The file is created by the Python pipeline (main.py).
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // The PDF is generated at sujet4/outputs/rapport_flotte_fantome.pdf
  // Next.js server runs from the frontend/ directory; adjust path accordingly.
  const pdfPath = path.join(process.cwd(), '..', 'outputs', 'rapport_flotte_fantome.pdf')

  if (!fs.existsSync(pdfPath)) {
    return res.status(404).send(
      'PDF not found. Run the Python pipeline first: python main.py'
    )
  }

  const fileBuffer = fs.readFileSync(pdfPath)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename="rapport_flotte_fantome.pdf"')
  res.setHeader('Content-Length', fileBuffer.length)
  res.status(200).send(fileBuffer)
}
