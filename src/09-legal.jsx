import React from 'react';
const createElement = React.createElement;

/* =================================================================
   JLPT Master — Legal: Privacy Policy & Terms of Use
   Rendered as a normal tab. Plain-language policy covering the
   data this app actually touches: Firebase auth/database, browser
   localStorage, and third-party lookup APIs.
   ================================================================= */

var LAST_UPDATED = 'June 12, 2026';
var CONTACT_EMAIL = 'manojkubehera59@gmail.com';

function section(title, body) {
    return createElement('section', { className: 'legal-section' },
        createElement('h3', { className: 'legal-section__title' }, title),
        body
    );
}

function p(text) {
    return createElement('p', { className: 'legal-p' }, text);
}

function li(text) {
    return createElement('li', { className: 'legal-li' }, text);
}

function PrivacyTab(props) {
    return createElement('div', { className: 'glass-card legal-card' },
        createElement('h2', { className: 'section-title' }, 'Privacy Policy & Terms of Use'),
        createElement('p', { className: 'section-desc' }, 'Last updated: ' + LAST_UPDATED),

        section('1. Overview',
            p('JLPT Master ("the Service") is a free study tool for learners of Japanese. This page explains what information the Service handles, how it is used, and the terms under which the Service is provided. By using the Service you agree to this policy and these terms.')),

        section('2. Information We Collect',
            createElement('ul', { className: 'legal-ul' },
                li('Account information — if you choose to sign in with Google, we receive your name, email address, and profile picture through Firebase Authentication. Signing in is optional; core features work without an account.'),
                li('Study data — your saved words, quiz scores, flashcard progress, streaks, custom questions, and preferences are stored locally in your browser (localStorage). If you sign in, scores and reviews you submit may be stored in Firebase so they can appear on the leaderboard and reviews sections.'),
                li('Reviews and multiplayer activity — text you voluntarily submit (reviews, display names, match results) is stored in Firebase and may be visible to other users.'),
                li('We do NOT collect payment details, precise location, advertising identifiers, or sell any personal data.'))),

        section('3. How Information Is Used',
            createElement('ul', { className: 'legal-ul' },
                li('To operate features you request: leaderboards, reviews, multiplayer matches, and synced sign-in.'),
                li('To remember your settings and progress between visits.'),
                li('We do not use your data for advertising, profiling, or sale to third parties.'))),

        section('4. Third-Party Services',
            createElement('ul', { className: 'legal-ul' },
                li('Google Firebase (authentication and database) — subject to Google’s Privacy Policy.'),
                li('Jotoba, Google Translate, kanjiapi.dev, KanjiVG and related public dictionary APIs — your search terms are sent to these services to fetch definitions, translations, and stroke-order diagrams.'),
                li('Google Fonts — fonts are loaded from Google’s servers.'),
                li('Your browser’s built-in speech synthesis is used for pronunciation; no audio is recorded or transmitted by us.'))),

        section('5. Cookies & Local Storage',
            p('The Service uses browser localStorage (not tracking cookies) to keep your study progress, theme, and language preferences on your own device. You can clear this at any time through your browser settings; doing so resets your local progress.')),

        section('6. Data Retention & Deletion',
            p('Local data stays on your device until you clear it. To request deletion of account-linked data (reviews, leaderboard entries), contact us at ' + CONTACT_EMAIL + ' from the email associated with your account and we will remove it within a reasonable time.')),

        section('7. Children',
            p('The Service is intended for general audiences studying Japanese and does not knowingly collect personal information from children under 13. If you believe a child has provided personal information, contact us and it will be removed.')),

        section('8. Terms of Use',
            createElement('ul', { className: 'legal-ul' },
                li('The Service is provided free of charge for personal, non-commercial study use.'),
                li('You agree not to abuse the Service: no attempts to disrupt it, scrape it at scale, post unlawful or offensive content in reviews/multiplayer, or impersonate others.'),
                li('Dictionary data, example sentences, and exam-style questions are provided for educational purposes. JLPT® is a trademark of the Japan Foundation and JEES; this Service is unofficial and is not affiliated with, endorsed by, or connected to them.'),
                li('We may modify, suspend, or discontinue any part of the Service at any time without notice.'))),

        section('9. Disclaimer of Warranties',
            p('THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ACCURACY OF DICTIONARY OR EXAM CONTENT, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. STUDY RESULTS ARE NOT GUARANTEED; PASSING ANY EXAMINATION REMAINS YOUR RESPONSIBILITY.')),

        section('10. Limitation of Liability',
            p('TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE OPERATOR OF THIS SERVICE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF DATA, ARISING FROM YOUR USE OF (OR INABILITY TO USE) THE SERVICE.')),

        section('11. Changes to This Policy',
            p('We may update this policy from time to time. The "Last updated" date above reflects the latest revision; continued use of the Service after changes constitutes acceptance.')),

        section('12. Contact',
            p('Questions, data requests, or concerns: ' + CONTACT_EMAIL))
    );
}

export { PrivacyTab };
