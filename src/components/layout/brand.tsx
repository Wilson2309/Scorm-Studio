import Link from "next/link";

/** Original document + connected learning steps. Shared by the public site and studio. */
export function Brand({href="/"}:{href?:string}){
 return <Link className="brand" href={href} aria-label="SCORM Studio, inicio"><span className="brand-mark"><svg viewBox="0 0 40 40" width="34" height="34" fill="none" aria-hidden="true"><path d="M12 8h11l6 6v18H12V8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M23 8v7h6M16 20h5v7h5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><circle cx="16" cy="20" r="2.4" fill="currentColor"/><circle cx="21" cy="27" r="2.4" fill="currentColor"/><circle cx="27" cy="27" r="2.4" fill="#F5C542"/></svg></span><span>scorm<span className="brand-light">studio</span><span className="brand-dot">.</span></span></Link>;
}
