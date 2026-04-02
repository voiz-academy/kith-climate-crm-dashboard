// gen-cert.mjs — fetches cert data from Supabase and writes a static verify page
// Env vars: CERTIFICATE_NUMBER, SUPABASE_URL, SUPABASE_ANON_KEY, OUT_DIR

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const { CERTIFICATE_NUMBER, SUPABASE_URL, SUPABASE_ANON_KEY, OUT_DIR = "/tmp/cert-page" } = process.env;

if (!CERTIFICATE_NUMBER) {
  console.error("CERTIFICATE_NUMBER is required");
  process.exit(1);
}

// Fetch cert record
const url = `${SUPABASE_URL}/rest/v1/certifications?certificate_number=eq.${encodeURIComponent(CERTIFICATE_NUMBER)}&select=*`;
const res = await fetch(url, {
  headers: {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Accept-Profile": "kith_climate",
  },
});

const rows = await res.json();
if (!rows.length) {
  console.error(`No certification found for ${CERTIFICATE_NUMBER}`);
  process.exit(1);
}

const cert = rows[0];
const fullName = `${cert.first_name} ${cert.last_name}`.trim();
const issuedDate = new Date(cert.issued_at).toLocaleDateString("en-US", {
  year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
});

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fullName} — Kith Climate AI-Certified</title>

  <meta property="og:title" content="${fullName} — Kith Climate AI-Certified" />
  <meta property="og:description" content="Completed the Kith Climate 8-Week Cohort: AI for Climate Professionals" />
  <meta property="og:image" content="https://kithclimate.com/images/kith-climate-badge-8week.png" />
  <meta property="og:url" content="https://kithclimate.com/verify/${CERTIFICATE_NUMBER}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${fullName} — Kith Climate AI-Certified" />
  <meta name="twitter:description" content="Completed the Kith Climate 8-Week Cohort: AI for Climate Professionals" />
  <meta name="twitter:image" content="https://kithclimate.com/images/kith-climate-badge-8week.png" />

  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #1a1d21;
      color: #e8e6e3;
      min-height: 100vh;
    }

    .page { max-width: 900px; margin: 0 auto; padding: 48px 40px 60px; }

    .back-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: #5B9A8B; text-decoration: none; margin-bottom: 40px; transition: color 0.2s; }
    .back-link:hover { color: #6FB3A2; }

    .hero { display: flex; align-items: flex-start; gap: 32px; margin-bottom: 40px; padding-bottom: 40px; border-bottom: 1px solid rgba(232, 230, 227, 0.06); }
    .badge-img { width: 140px; height: 140px; flex-shrink: 0; }
    .hero-info { flex: 1; }

    .verified-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #5B9A8B; background: rgba(91, 154, 139, 0.1); border: 1px solid rgba(91, 154, 139, 0.2); border-radius: 4px; padding: 4px 10px; margin-bottom: 16px; }
    .verified-badge svg { width: 14px; height: 14px; }

    .hero-name { font-size: 32px; font-weight: 600; letter-spacing: -0.02em; margin-bottom: 6px; }
    .hero-title { font-size: 18px; font-weight: 500; color: rgba(232, 230, 227, 0.6); margin-bottom: 20px; }

    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; }
    .detail-item { display: flex; gap: 8px; font-size: 13px; }
    .detail-label { color: rgba(232, 230, 227, 0.35); white-space: nowrap; }
    .detail-value { color: rgba(232, 230, 227, 0.7); font-weight: 500; }

    .domains-section { margin-bottom: 40px; padding-bottom: 40px; border-bottom: 1px solid rgba(232, 230, 227, 0.06); }
    .section-label { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(232, 230, 227, 0.3); margin-bottom: 12px; }
    .domain-tags { display: flex; flex-wrap: wrap; gap: 8px; }
    .domain-tag { font-size: 12px; font-weight: 500; color: #5B9A8B; background: rgba(91, 154, 139, 0.08); border: 1px solid rgba(91, 154, 139, 0.15); border-radius: 4px; padding: 6px 12px; }

    .cert-section { margin-bottom: 40px; }
    .cert-frame { border: 1px solid rgba(232, 230, 227, 0.06); border-radius: 12px; overflow: hidden; background: #222; }
    .certificate { width: 100%; aspect-ratio: 297 / 210; background: linear-gradient(145deg, #353a40 0%, #2e3338 50%, #353a40 100%); position: relative; overflow: hidden; color: #e8e6e3; }

    .beam { position: absolute; top: -100px; right: 80px; width: 380px; height: 1100px; background: linear-gradient(180deg, transparent 0%, rgba(111,179,162,0.06) 20%, rgba(111,179,162,0.10) 45%, rgba(111,179,162,0.06) 70%, transparent 100%); transform: rotate(25deg); pointer-events: none; z-index: 1; }
    .beam-2 { position: absolute; top: -60px; right: 200px; width: 200px; height: 1000px; background: linear-gradient(180deg, transparent 0%, rgba(111,179,162,0.04) 30%, rgba(111,179,162,0.07) 50%, rgba(111,179,162,0.04) 70%, transparent 100%); transform: rotate(25deg); pointer-events: none; z-index: 1; }
    .beam-3 { position: absolute; top: -80px; left: 60px; width: 250px; height: 1000px; background: linear-gradient(180deg, transparent 0%, rgba(111,179,162,0.03) 30%, rgba(111,179,162,0.05) 50%, rgba(111,179,162,0.03) 70%, transparent 100%); transform: rotate(-15deg); pointer-events: none; z-index: 1; }
    .border-frame { position: absolute; top: 28px; left: 28px; right: 28px; bottom: 28px; border: 1.5px solid rgba(111,179,162,0.4); border-radius: 12px; pointer-events: none; z-index: 2; }
    .border-frame::before { content: ''; position: absolute; inset: 6px; border: 1px solid rgba(111,179,162,0.1); border-radius: 8px; }
    .content { position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center; justify-content: space-between; height: 100%; padding: 4.6% 7.1% 4.6%; text-align: center; }
    .top-section { display: flex; flex-direction: column; align-items: center; }
    .wordmark-svg { width: 34%; height: auto; margin-bottom: 2.5%; display: block; margin-left: auto; margin-right: auto; }
    .cert-title { font-size: clamp(24px, 6vw, 68px); font-weight: 300; letter-spacing: 0.35em; text-transform: uppercase; margin-bottom: 0.4%; }
    .cert-subtitle { font-size: clamp(10px, 1.6vw, 18px); font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(232,230,227,0.45); }
    .middle-section { display: flex; flex-direction: column; align-items: center; }
    .description { font-size: clamp(10px, 1.5vw, 17px); font-weight: 400; line-height: 1.75; color: rgba(232,230,227,0.55); max-width: 90%; margin-bottom: 1%; }
    .recipient-name { font-size: clamp(16px, 3.4vw, 38px); font-weight: 600; letter-spacing: 0.02em; margin-bottom: 1.2%; }
    .award-title { font-size: clamp(14px, 2.5vw, 28px); font-weight: 600; margin-bottom: 0.8%; }
    .topics { font-size: clamp(8px, 1.2vw, 13px); font-weight: 400; letter-spacing: 0.06em; color: rgba(232,230,227,0.4); max-width: 92%; line-height: 1.6; }
    .topics .separator { color: #5B9A8B; margin: 0 6px; opacity: 0.6; }
    .bottom-section { display: flex; flex-direction: column; align-items: center; width: 100%; }
    .bottom-row { display: flex; align-items: flex-end; justify-content: center; width: 100%; padding: 0 2%; gap: 12%; margin-bottom: 1.2%; }
    .signature { text-align: center; min-width: 16%; }
    .signature-cursive { font-style: italic; font-size: clamp(12px, 2.3vw, 26px); font-weight: 300; letter-spacing: -0.01em; color: rgba(232,230,227,0.6); margin-bottom: 0.7%; }
    .signature-line { width: 100%; max-width: 220px; height: 1px; background: rgba(232,230,227,0.2); margin: 0 auto 0.9%; }
    .signature-name { font-size: clamp(9px, 1.3vw, 15px); font-weight: 600; color: rgba(232,230,227,0.75); }
    .signature-title { font-size: clamp(8px, 1.15vw, 13px); font-weight: 400; color: rgba(232,230,227,0.35); margin-top: 0.3%; }
    .footer-meta { display: flex; gap: 32px; justify-content: center; width: 100%; }
    .meta-item { text-align: center; }
    .meta-label { font-size: clamp(6px, 0.7vw, 8px); font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(232,230,227,0.25); margin-bottom: 2px; }
    .meta-value { font-size: clamp(7px, 1vw, 11px); font-weight: 400; color: rgba(232,230,227,0.45); }

    .actions { display: flex; gap: 16px; justify-content: center; margin-bottom: 40px; }
    .action-link { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; font-size: 13px; font-weight: 600; border-radius: 6px; text-decoration: none; transition: all 0.2s; cursor: pointer; border: none; font-family: inherit; }
    .action-link.primary { background: #5B9A8B; color: #fff; }
    .action-link.primary:hover { background: #6FB3A2; }
    .action-link.secondary { background: transparent; border: 1px solid rgba(232, 230, 227, 0.1); color: rgba(232, 230, 227, 0.6); }
    .action-link.secondary:hover { border-color: rgba(232, 230, 227, 0.2); color: #e8e6e3; }

    .page-footer { text-align: center; padding-top: 32px; border-top: 1px solid rgba(232, 230, 227, 0.06); }
    .page-footer p { font-size: 12px; color: rgba(232, 230, 227, 0.3); }
    .page-footer a { color: #5B9A8B; text-decoration: none; }

    @media (max-width: 640px) {
      .page { padding: 32px 20px 40px; }
      .hero { flex-direction: column; align-items: center; text-align: center; gap: 20px; }
      .badge-img { width: 100px; height: 100px; }
      .details-grid { grid-template-columns: 1fr; }
      .actions { flex-direction: column; align-items: center; }
    }
    @media print {
      .back-link, .actions { display: none; }
      body { background: #1a1d21; }
    }
  </style>
</head>
<body>
<div class="page">

  <a class="back-link" href="https://kithclimate.com">
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    kithclimate.com
  </a>

  <div class="hero">
    <img class="badge-img" src="https://kithclimate.com/images/kith-climate-badge-8week.png" alt="Kith Climate AI-Certified Badge" />
    <div class="hero-info">
      <div class="verified-badge">
        <svg viewBox="0 0 16 16" fill="none"><path d="M13.3 4.7L6.5 11.5L2.7 7.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Verified Credential
      </div>
      <div class="hero-name">${fullName}</div>
      <div class="hero-title">Kith Climate AI-Certified</div>
      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">Program:</span>
          <span class="detail-value">8-Week Cohort &mdash; AI for Climate Professionals</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Certificate No.:</span>
          <span class="detail-value">${CERTIFICATE_NUMBER}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Issued:</span>
          <span class="detail-value">${issuedDate}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Cohort:</span>
          <span class="detail-value">${cert.cohort}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="domains-section">
    <div class="section-label">Domains Covered</div>
    <div class="domain-tags">
      <span class="domain-tag">Life Cycle Assessment</span>
      <span class="domain-tag">Supply Chain Sustainability</span>
      <span class="domain-tag">Carbon Reduction</span>
      <span class="domain-tag">Climate Disclosure &amp; Compliance</span>
      <span class="domain-tag">Circular Economy</span>
      <span class="domain-tag">Sustainability Strategy</span>
    </div>
  </div>

  <div class="cert-section">
    <div class="section-label">Certificate</div>
    <div class="cert-frame">
      <div class="certificate">
        <div class="beam"></div>
        <div class="beam-2"></div>
        <div class="beam-3"></div>
        <div class="border-frame"></div>
        <div class="content">
          <div class="top-section">
            <svg class="wordmark-svg" viewBox="0 0 800 177" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21.6364 110.736L21.5455 94.1454H23.9091L51.7273 64.5999H68L36.2727 98.2363H34.1364L21.6364 110.736ZM9.13636 134.418V41.3272H22.7273V134.418H9.13636ZM53.2273 134.418L28.2273 101.236L37.5909 91.7363L69.9091 134.418H53.2273ZM77.8264 134.418V64.5999H91.4173V134.418H77.8264ZM84.69 53.8272C82.3264 53.8272 80.2961 53.0393 78.5991 51.4635C76.9324 49.8575 76.0991 47.9484 76.0991 45.7363C76.0991 43.4938 76.9324 41.5848 78.5991 40.009C80.2961 38.4029 82.3264 37.5999 84.69 37.5999C87.0536 37.5999 89.0688 38.4029 90.7355 40.009C92.4324 41.5848 93.2809 43.4938 93.2809 45.7363C93.2809 47.9484 92.4324 49.8575 90.7355 51.4635C89.0688 53.0393 87.0536 53.8272 84.69 53.8272ZM139.732 64.5999V75.509H101.596V64.5999H139.732ZM111.823 47.8726H125.414V113.918C125.414 116.554 125.808 118.539 126.596 119.873C127.384 121.176 128.399 122.07 129.641 122.554C130.914 123.009 132.293 123.236 133.778 123.236C134.869 123.236 135.823 123.161 136.641 123.009C137.46 122.857 138.096 122.736 138.55 122.645L141.005 133.873C140.217 134.176 139.096 134.479 137.641 134.782C136.187 135.115 134.369 135.297 132.187 135.327C128.611 135.388 125.278 134.751 122.187 133.418C119.096 132.085 116.596 130.024 114.687 127.236C112.778 124.448 111.823 120.948 111.823 116.736V47.8726ZM167.297 92.9635V134.418H153.706V41.3272H167.115V75.9635H167.979C169.615 72.206 172.115 69.2211 175.479 67.009C178.843 64.7969 183.237 63.6908 188.661 63.6908C193.449 63.6908 197.631 64.6757 201.206 66.6454C204.812 68.6151 207.6 71.5545 209.57 75.4635C211.57 79.3423 212.57 84.1908 212.57 90.009V134.418H198.979V91.6454C198.979 86.5241 197.661 82.5545 195.025 79.7363C192.388 76.8878 188.722 75.4635 184.025 75.4635C180.812 75.4635 177.934 76.1454 175.388 77.509C172.873 78.8726 170.888 80.8726 169.434 83.509C168.009 86.1151 167.297 89.2666 167.297 92.9635Z" fill="#E8E6E3"/>
              <path d="M382.954 135.873C376.712 135.873 371.273 134.312 366.636 131.191C362.03 128.07 358.454 123.797 355.909 118.373C353.364 112.948 352.091 106.767 352.091 99.8272C352.091 92.8272 353.379 86.5999 355.954 81.1454C358.561 75.6908 362.167 71.4181 366.773 68.3272C371.379 65.206 376.727 63.6454 382.818 63.6454C387.485 63.6454 391.712 64.5545 395.5 66.3726C399.288 68.1605 402.409 70.6908 404.864 73.9635C407.348 77.206 408.909 80.9938 409.545 85.3272H401.364C400.515 81.3878 398.47 78.0242 395.227 75.2363C392.015 72.4181 387.924 71.009 382.954 71.009C378.5 71.009 374.561 72.2211 371.136 74.6454C367.712 77.0393 365.03 80.3878 363.091 84.6908C361.182 88.9635 360.227 93.9181 360.227 99.5545C360.227 105.221 361.167 110.236 363.045 114.6C364.924 118.933 367.561 122.327 370.954 124.782C374.379 127.236 378.379 128.464 382.954 128.464C386.045 128.464 388.864 127.888 391.409 126.736C393.985 125.554 396.136 123.888 397.864 121.736C399.621 119.585 400.803 117.024 401.409 114.054H409.591C408.985 118.267 407.485 122.024 405.091 125.327C402.727 128.6 399.651 131.176 395.864 133.054C392.106 134.933 387.803 135.873 382.954 135.873ZM437.583 41.3272V134.418H429.492V41.3272H437.583ZM461.643 134.418V64.5999H469.779V134.418H461.643ZM465.779 52.5999C464.112 52.5999 462.688 52.0393 461.506 50.9181C460.324 49.7666 459.734 48.3878 459.734 46.7817C459.734 45.1757 460.324 43.812 461.506 42.6908C462.688 41.5393 464.112 40.9635 465.779 40.9635C467.446 40.9635 468.87 41.5393 470.052 42.6908C471.234 43.812 471.824 45.1757 471.824 46.7817C471.824 48.3878 471.234 49.7666 470.052 50.9181C468.87 52.0393 467.446 52.5999 465.779 52.5999ZM493.737 134.418V64.5999H501.6V75.3272H502.328C503.722 71.7211 506.04 68.8878 509.282 66.8272C512.555 64.7363 516.479 63.6908 521.055 63.6908C525.873 63.6908 529.828 64.8272 532.919 67.0999C536.04 69.3423 538.373 72.4332 539.919 76.3726H540.509C542.085 72.4938 544.646 69.4181 548.191 67.1454C551.767 64.8423 556.1 63.6908 561.191 63.6908C567.676 63.6908 572.797 65.7363 576.555 69.8272C580.313 73.8878 582.191 79.8272 582.191 87.6454V134.418H574.1V87.6454C574.1 82.1302 572.691 77.9938 569.873 75.2363C567.055 72.4787 563.343 71.0999 558.737 71.0999C553.403 71.0999 549.297 72.7363 546.419 76.009C543.54 79.2817 542.1 83.4332 542.1 88.4635V134.418H533.828V86.9181C533.828 82.1908 532.509 78.3726 529.873 75.4635C527.237 72.5545 523.525 71.0999 518.737 71.0999C515.525 71.0999 512.631 71.8878 510.055 73.4635C507.509 75.0393 505.494 77.2363 504.009 80.0545C502.555 82.8423 501.828 86.0545 501.828 89.6908V134.418H493.737ZM625.672 136.009C621.46 136.009 617.611 135.191 614.126 133.554C610.641 131.888 607.869 129.494 605.808 126.373C603.748 123.221 602.717 119.403 602.717 114.918C602.717 111.464 603.369 108.554 604.672 106.191C605.975 103.827 607.823 101.888 610.217 100.373C612.611 98.8575 615.444 97.6605 618.717 96.7817C621.99 95.9029 625.596 95.2211 629.535 94.7363C633.444 94.2514 636.748 93.8272 639.444 93.4635C642.172 93.0999 644.248 92.5242 645.672 91.7363C647.096 90.9484 647.808 89.6757 647.808 87.9181V86.2817C647.808 81.5242 646.384 77.7817 643.535 75.0545C640.717 72.2969 636.657 70.9181 631.354 70.9181C626.323 70.9181 622.217 72.0242 619.035 74.2363C615.884 76.4484 613.672 79.0545 612.399 82.0545L604.717 79.2817C606.293 75.4635 608.475 72.4181 611.263 70.1454C614.051 67.8423 617.172 66.1908 620.626 65.1908C624.081 64.1605 627.581 63.6454 631.126 63.6454C633.793 63.6454 636.566 63.9938 639.444 64.6908C642.354 65.3878 645.051 66.5999 647.535 68.3272C650.02 70.0241 652.035 72.4029 653.581 75.4635C655.126 78.4938 655.899 82.3423 655.899 87.009V134.418H647.808V123.373H647.308C646.338 125.433 644.899 127.433 642.99 129.373C641.081 131.312 638.687 132.903 635.808 134.145C632.929 135.388 629.551 136.009 625.672 136.009ZM626.763 128.6C631.066 128.6 634.793 127.645 637.944 125.736C641.096 123.827 643.52 121.297 645.217 118.145C646.944 114.964 647.808 111.464 647.808 107.645V97.5545C647.202 98.1302 646.187 98.6454 644.763 99.0999C643.369 99.5545 641.748 99.9635 639.899 100.327C638.081 100.661 636.263 100.948 634.444 101.191C632.626 101.433 630.99 101.645 629.535 101.827C625.596 102.312 622.232 103.07 619.444 104.1C616.657 105.13 614.52 106.554 613.035 108.373C611.551 110.161 610.808 112.464 610.808 115.282C610.808 119.524 612.323 122.812 615.354 125.145C618.384 127.448 622.187 128.6 626.763 128.6ZM707.482 64.5999V71.6454H674.164V64.5999H707.482ZM684.573 47.8726H692.709V116.191C692.709 119.1 693.209 121.388 694.209 123.054C695.209 124.691 696.512 125.857 698.118 126.554C699.724 127.221 701.436 127.554 703.254 127.554C704.315 127.554 705.224 127.494 705.982 127.373C706.739 127.221 707.406 127.07 707.982 126.918L709.709 134.236C708.921 134.539 707.951 134.812 706.8 135.054C705.648 135.327 704.224 135.464 702.527 135.464C699.558 135.464 696.694 134.812 693.936 133.509C691.209 132.206 688.967 130.267 687.209 127.691C685.451 125.115 684.573 121.918 684.573 118.1V47.8726ZM755.894 135.873C749.379 135.873 743.743 134.357 738.985 131.327C734.227 128.267 730.546 124.039 727.939 118.645C725.364 113.221 724.076 106.979 724.076 99.9181C724.076 92.8878 725.364 86.6454 727.939 81.1908C730.546 75.706 734.136 71.4181 738.712 68.3272C743.318 65.206 748.636 63.6454 754.667 63.6454C758.455 63.6454 762.106 64.3423 765.621 65.7363C769.136 67.0999 772.288 69.206 775.076 72.0545C777.894 74.8726 780.121 78.4332 781.758 82.7363C783.394 87.009 784.212 92.0696 784.212 97.9181V101.918H729.667V94.7817H775.939C775.939 90.2969 775.03 86.2666 773.212 82.6908C771.424 79.0848 768.924 76.2363 765.712 74.1454C762.53 72.0545 758.849 71.009 754.667 71.009C750.243 71.009 746.349 72.1908 742.985 74.5545C739.621 76.9181 736.985 80.0393 735.076 83.9181C733.197 87.7969 732.243 92.0393 732.212 96.6454V100.918C732.212 106.464 733.167 111.312 735.076 115.464C737.015 119.585 739.758 122.782 743.303 125.054C746.849 127.327 751.046 128.464 755.894 128.464C759.197 128.464 762.091 127.948 764.576 126.918C767.091 125.888 769.197 124.509 770.894 122.782C772.621 121.024 773.924 119.1 774.803 117.009L782.485 119.509C781.424 122.448 779.682 125.161 777.258 127.645C774.864 130.13 771.864 132.13 768.258 133.645C764.682 135.13 760.561 135.873 755.894 135.873Z" fill="#E8E6E3" fill-opacity="0.4"/>
              <g filter="url(#filter0_d_6_8)"><rect x="289.092" y="23.4181" width="9" height="130" rx="4.5" transform="rotate(8 289.092 23.4181)" fill="url(#paint0_linear_6_8)" shape-rendering="crispEdges"/></g>
              <defs>
                <filter id="filter0_d_6_8" x="247.582" y="0" width="73.8411" height="176.824" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset/><feGaussianBlur stdDeviation="12"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0.356863 0 0 0 0 0.603922 0 0 0 0 0.545098 0 0 0 0.5 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_6_8"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_6_8" result="shape"/></filter>
                <linearGradient id="paint0_linear_6_8" x1="293.592" y1="23.4181" x2="293.592" y2="153.418" gradientUnits="userSpaceOnUse"><stop stop-color="#5B9A8B" stop-opacity="0.1"/><stop offset="0.25" stop-color="#5B9A8B"/><stop offset="0.75" stop-color="#5B9A8B"/><stop offset="1" stop-color="#5B9A8B" stop-opacity="0.1"/></linearGradient>
              </defs>
            </svg>
            <div class="cert-title">CERTIFICATE</div>
            <div class="cert-subtitle">OF COMPLETION</div>
          </div>
          <div class="middle-section">
            <p class="description">This certifies that</p>
            <div class="recipient-name">${fullName}</div>
            <p class="description">has successfully completed the Kith Climate 8-Week Cohort Program, building working AI-powered climate applications and demonstrating proficiency across the sustainability consulting stack, earning the title of</p>
            <div class="award-title">Kith Climate AI-Certified</div>
            <div class="topics">Life Cycle Assessment<span class="separator">/</span>Supply Chain Sustainability<span class="separator">/</span>Carbon Reduction<span class="separator">/</span>Climate Disclosure &amp; Compliance<span class="separator">/</span>Circular Economy<span class="separator">/</span>Sustainability Strategy</div>
          </div>
          <div class="bottom-section">
            <div class="bottom-row">
              <div class="signature"><div class="signature-cursive">Diego Espinosa</div><div class="signature-line"></div><div class="signature-name">Diego Espinosa</div><div class="signature-title">CEO &amp; Co-Founder</div></div>
              <div class="signature"><div class="signature-cursive">Ben Hillier</div><div class="signature-line"></div><div class="signature-name">Ben Hillier</div><div class="signature-title">Co-Founder &amp; COO</div></div>
            </div>
            <div class="footer-meta">
              <div class="meta-item"><div class="meta-label">Certificate No.</div><div class="meta-value">${CERTIFICATE_NUMBER}</div></div>
              <div class="meta-item"><div class="meta-label">Date Issued</div><div class="meta-value">${issuedDate}</div></div>
              <div class="meta-item"><div class="meta-label">Verify</div><div class="meta-value">kithclimate.com</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="actions">
    <button class="action-link primary" onclick="window.print()">Download as PDF</button>
    <a class="action-link secondary" href="https://kithclimate.com/credential/8-week">About This Credential</a>
  </div>

  <div class="page-footer">
    <p><strong style="color: rgba(232,230,227,0.5);">Kith Climate</strong> &mdash; Part of Kith AI Lab</p>
    <p style="margin-top: 4px;"><a href="https://kithclimate.com">kithclimate.com</a></p>
  </div>

</div>
</body>
</html>`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "index.html"), html, "utf8");
console.log(`Written: ${join(OUT_DIR, "index.html")} (${fullName}, ${CERTIFICATE_NUMBER})`);
