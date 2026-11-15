'use client';

// The words of the screens every app has — error, not found, loading, help and
// feedback (App Excellence Standard E1 · E12) — for the apps made from this template
// before its twelve-language dictionary existed. Those apps keep their own en/ar
// i18n; these screens must not depend on it (an error screen that throws because a
// provider is missing is the worst screen there is), so they carry their own words
// and read the language the app already chose from <html lang>.
//
// The text is the template's own (src/lib/i18n/en.ts · ar.ts), word for word. When an
// app moves to the template's dictionary, it moves to the template's screens and
// these files go. Kept identical in every app by template-sync (`fleet/`).

import { useEffect, useState } from 'react';

const en = {
  states: {
    errorTitle:    'Something went wrong',
    errorBody:     'This screen could not load. Your data is safe — try again.',
    retry:         'Try again',
    goHome:        'Go to home',
    notFoundTitle: 'Page not found',
    notFoundBody:  'This page does not exist or was moved.',
    loadingLabel:  'Loading',
  },
  help: {
    title:   'Help & feedback',
    intro:   'Answers to the common questions — and a way to tell us anything else.',
    q1:      'How do I sign in?',
    a1:      'Tap “Sign in with Pi”. Inside the Pi Browser your Pi account signs you in; nothing else is needed.',
    q2:      'How do payments work?',
    a2:      'Every payment is approved by you in your Pi wallet. TEC never moves Pi without that approval.',
    q3:      'Who sees my data?',
    a3:      'Only you, and only what you choose to share. The privacy policy below says exactly what is kept.',
    privacy: 'Privacy',
    terms:   'Terms',
    back:    'Back to the app',
  },
  feedback: {
    title:       'Tell us what you think',
    placeholder: 'What worked, what did not, what you wish this app did…',
    send:        'Send',
    sending:     'Sending…',
    thanks:      'Thank you — your message arrived.',
    thanksHint:  'The team reads every message. If it needs an answer, you will hear back inside TEC.',
    sendAnother: 'Send another',
    tooShort:    'Write a few words first.',
    tooLong:     '{n} characters — please keep it under 2000.',
    failed:      'It could not be sent. Try again in a moment.',
    signIn:      'Sign in with Pi first — then your message can be sent.',
    privacyNote: 'Sent with your Pi username and the page you are on — nothing else.',
  },
};

export type FleetStrings = typeof en;

const ar: FleetStrings = {
  states: {
    errorTitle:    'حدث خطأ ما',
    errorBody:     'تعذّر تحميل هذه الشاشة. بياناتك بأمان — حاول مرة أخرى.',
    retry:         'حاول مرة أخرى',
    goHome:        'الذهاب للرئيسية',
    notFoundTitle: 'الصفحة غير موجودة',
    notFoundBody:  'هذه الصفحة غير موجودة أو تم نقلها.',
    loadingLabel:  'جارٍ التحميل',
  },
  help: {
    title:   'المساعدة والملاحظات',
    intro:   'إجابات للأسئلة الشائعة — وطريقة تقول لنا بها أي شيء آخر.',
    q1:      'كيف أسجّل الدخول؟',
    a1:      'اضغط «تسجيل الدخول بـ Pi». داخل متصفح Pi يسجّلك حساب Pi تلقائياً؛ لا تحتاج شيئاً آخر.',
    q2:      'كيف تعمل المدفوعات؟',
    a2:      'كل دفعة توافق عليها أنت في محفظة Pi. لا تحرّك TEC أي Pi بدون هذه الموافقة.',
    q3:      'من يرى بياناتي؟',
    a3:      'أنت فقط، وفقط ما تختار مشاركته. سياسة الخصوصية بالأسفل توضح بالضبط ما يُحفظ.',
    privacy: 'الخصوصية',
    terms:   'الشروط',
    back:    'العودة للتطبيق',
  },
  feedback: {
    title:       'قل لنا رأيك',
    placeholder: 'ما الذي نجح، وما الذي لم ينجح، وما الذي تتمنى أن يفعله التطبيق…',
    send:        'إرسال',
    sending:     'جارٍ الإرسال…',
    thanks:      'شكراً — وصلت رسالتك.',
    thanksHint:  'الفريق يقرأ كل رسالة. إذا احتاجت رداً، سيصلك داخل TEC.',
    sendAnother: 'إرسال رسالة أخرى',
    tooShort:    'اكتب بضع كلمات أولاً.',
    tooLong:     '{n} حرفاً — من فضلك اجعلها أقل من 2000.',
    failed:      'تعذّر الإرسال. حاول مرة أخرى بعد قليل.',
    signIn:      'سجّل الدخول بـ Pi أولاً — بعدها تُرسل رسالتك.',
    privacyNote: 'تُرسل مع اسم مستخدم Pi والصفحة التي أنت فيها — ولا شيء غير ذلك.',
  },
};

export const FLEET_STRINGS = { en, ar } as const;

/** Arabic when the app set <html lang="ar">; English otherwise — and on the server's first paint. */
export function pickFleetLang(htmlLang: string | null | undefined): 'en' | 'ar' {
  return (htmlLang ?? '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function useFleetStrings(): { s: FleetStrings; lang: 'en' | 'ar'; dir: 'ltr' | 'rtl' } {
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  useEffect(() => {
    if (typeof document !== 'undefined') setLang(pickFleetLang(document.documentElement.lang));
  }, []);
  return { s: FLEET_STRINGS[lang], lang, dir: lang === 'ar' ? 'rtl' : 'ltr' };
}
