export const dynamic = "force-static";

export default function Offline() {
  return (
    <main className="auth-wrap">
      <div className="auth-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="KEM" className="logo" />
        <h1>No internet</h1>
        <p>This page is not saved on the phone yet. Screens you opened before still work.</p>
        <p lang="ml">ഇന്റർനെറ്റ് ഇല്ല. മുമ്പ് തുറന്ന സ്ക്രീനുകൾ പ്രവർത്തിക്കും.</p>
        <p lang="hi">इंटरनेट नहीं है। पहले खोली गई स्क्रीन चलेंगी।</p>
        {/* full page reload on purpose, so the network is retried */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="btn btn-primary btn-big" href="/">
          Try again
        </a>
      </div>
    </main>
  );
}
