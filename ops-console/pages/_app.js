import '../styles/globals.css';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';

export default function OpsApp({ Component, pageProps }) {
  const router = useRouter();
  const isLoginPage = router.pathname === '/login';

  if (isLoginPage) {
    return <Component {...pageProps} />;
  }

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
