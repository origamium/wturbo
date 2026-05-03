export const metadata = {
  title: 'wtb Sample App',
  description: 'Sample Next.js application for wtb testing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
