export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>wtb Sample Application</h1>
      <p>This is a sample Next.js application for testing wtb functionality.</p>

      <h2>Environment</h2>
      <ul>
        <li>Node Environment: {process.env.NODE_ENV}</li>
        <li>API URL: {process.env.NEXT_PUBLIC_API_URL}</li>
      </ul>

      <h2>Features</h2>
      <ul>
        <li>PostgreSQL database</li>
        <li>Next.js frontend</li>
        <li>Debian development container</li>
      </ul>
    </main>
  )
}
