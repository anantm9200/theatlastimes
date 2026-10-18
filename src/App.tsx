/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
const ArticleView = lazy(() => import('./pages/ArticleView'));
const Preferences = lazy(() => import('./pages/Preferences'));
import Feed from './pages/Feed';
const NewNews = lazy(() => import('./pages/NewNews'));
import Archives from './pages/Archives';
const Briefcase = lazy(() => import('./pages/Briefcase'));
const EditArticle = lazy(() => import('./pages/EditArticle'));
const DeleteArticle = lazy(() => import('./pages/DeleteArticle'));
const Editorial = lazy(() => import('./pages/Editorial'));
import { UserProvider } from './lib/useAuth';
import SeoHead from './lib/SeoHead';
import PublicationInfo from './pages/PublicationInfo';

export default function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <Suspense fallback={<div role="status" className="py-20 text-center">Loading page…</div>}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="article/:id" element={<ArticleView />} />
            <Route path="article/:id/edit" element={<EditArticle />} />
            <Route path="article/:id/delete" element={<DeleteArticle />} />
            <Route path="category/:id" element={<Feed />} />
            <Route path="region/:id" element={<Feed />} />
            <Route path="preferences" element={<Preferences />} />
            <Route path="new-news" element={<NewNews />} />
            <Route path="editorial" element={<Editorial />} />
            <Route path="archives" element={<Archives />} />
            <Route path="briefcase" element={<Briefcase />} />
            <Route path="about" element={<PublicationInfo />} />
            <Route path="editorial-policy" element={<PublicationInfo policy />} />
            <Route path="*" element={<><SeoHead title="Page not found" noindex /><div className="p-10 text-center py-20 text-muted-foreground"><h1 className="text-2xl font-serif mb-4">404 - Document Not Found</h1><p>The requested bulletin could not be located.</p></div></>} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </UserProvider>
  );
}
