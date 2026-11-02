import { HeartHandshake, Phone, MapPin, ArrowUpRight } from "lucide-react";
export function SupportCard({ prominent = false }: { prominent?: boolean }) {
  return (
    <aside
      aria-live={prominent ? "polite" : undefined}
      aria-label="Wellbeing support"
      className={`support-card ${prominent ? "prominent" : ""}`}
    >
      <HeartHandshake size={26} />
      <span className="eyebrow">YOU DON’T HAVE TO FIGURE IT OUT ALONE</span>
      <h2>{prominent ? "Support is here for you." : "A person to talk to."}</h2>
      <p>
        {prominent
          ? "If you feel unsafe or might hurt yourself, reach out now. Stay near someone you trust while you get support."
          : "You can reach out on a hard day, an ordinary day, or when you’re unsure where to begin."}
      </p>
      <div className="helpline">
        <span>Tele-MANAS</span>
        <strong>Free · 24/7 mental health support in India</strong>
        <a href="tel:+9114416?oai_link_source=model_response_hotline">
          <Phone size={17} />
          14416 <ArrowUpRight size={16} />
        </a>
        <a
          className="support-website"
          href="https://telemanas.mohfw.gov.in/home?oai_link_source=model_response_hotline"
          target="_blank"
          rel="noreferrer"
        >
          Official Tele-MANAS website <ArrowUpRight size={13} />
        </a>
      </div>
      <div className="counselor">
        <span>
          <MapPin size={15} />
          Mental Health
        </span>
        <p>Facilities: Assessment and Counselling</p>
        <dl>
          <div>
            <dt>Venue</dt>
            <dd>Hope, Health &amp; Healing, Learning Center, 2nd Floor, Central Campus</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>
              <a href="tel:+916394490647">
                <Phone size={13} /> +91-6394490647
              </a>
            </dd>
          </div>
        </dl>
        <span style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
          <MapPin size={15} />
          Medical Clinic
        </span>
        <p>Facilities: Nursing Station and Physician Consultation</p>
        <dl>
          <div>
            <dt>Venue</dt>
            <dd>Activity Center, Central Campus</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>
              <a href="tel:+917899929134">
                <Phone size={13} /> +91-7899929134
              </a>
            </dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
