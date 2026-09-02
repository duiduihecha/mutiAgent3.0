import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { AuthProvider } from '@/lib/auth-client';
import { LearnerProvider } from '@/lib/learner-context';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '跨文化中文学习系统 | 母语驱动的对比式学习',
    template: '%s | 跨文化中文学习系统',
  },
  description:
    '面向 8 大母语文化圈、HSK 1–9 级的智能中文学习平台。基于动态混合知识底座与多智能体网状协同，通过「母语阐释打底 + 跨文化异同匹配 + 场景化练习闭环」，帮助留学生高效掌握中文语言与文化语用。',
  keywords: [
    '中文学习',
    '跨文化对比',
    'HSK',
    '母语学习',
    '文化焦虑度',
    '多智能体',
    '知识图谱',
    '对外汉语',
    '文化语用',
    'Chinese learning',
    'cross-cultural',
  ],
  openGraph: {
    title: '跨文化中文学习系统 | 母语驱动的对比式学习',
    description:
      '面向 8 大母语文化圈的智能中文学习平台：母语阐释打底、跨文化异同匹配、场景化练习闭环。',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`antialiased`}>
        <AuthProvider>
          <LearnerProvider>
            {isDev && <Inspector />}
            {children}
          </LearnerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
