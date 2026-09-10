import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'chat-agent test UI',
  description: 'Local test UI for chat-agent API',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
