'use client';
import { useState, useTransition } from 'react';
import ConfirmDialog from './ConfirmDialog';

/** Çıkış — yanlışlıkla tıklanıp oturumu kapatmasın diye önce onay ister. */
export default function LogoutButton({ action }: { action: () => Promise<void> }) {
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <button
        type="button" onClick={() => setAsk(true)}
        className="navlink inline-flex items-center px-2" title="Çıkış" aria-label="Çıkış"
      >
        <svg viewBox="0 0 15 15" width="15" height="15" fill="none" stroke="currentColor"
          strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 2H3.2A1.2 1.2 0 0 0 2 3.2v8.6A1.2 1.2 0 0 0 3.2 13H6" />
          <path d="M10 10.5 13 7.5 10 4.5" />
          <path d="M13 7.5H5.5" />
        </svg>
      </button>

      {ask && (
        <ConfirmDialog
          title="Çıkış yapılsın mı?"
          message="Oturum kapanır ve tekrar şifre sorulur. Girdiğin veriler etkilenmez."
          confirmLabel="Çıkış yap"
          pending={pending}
          onCancel={() => setAsk(false)}
          onConfirm={() => start(async () => { await action(); })}
        />
      )}
    </>
  );
}
