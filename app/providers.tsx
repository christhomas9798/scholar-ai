'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';

export const Providers = ({ children }: { children: React.ReactNode }) => {
    return (
        <SessionProvider>
            <Toaster position="top-right" />
            {children}
        </SessionProvider>
    );
};
