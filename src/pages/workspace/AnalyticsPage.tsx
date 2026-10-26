import { Navigate, useLocation } from 'react-router-dom';

/** Compatibility URL. Both route guards still apply; reports have one canonical screen. */
export default function Page() {
  const { search, hash } = useLocation();
  return <Navigate to={'/dashboard' + search + hash} replace />;
}
