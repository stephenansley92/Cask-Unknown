import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/redirects";

type RateDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    returnTo?: string | string[];
    owner?: string | string[];
  }>;
};

function getSingleQueryValue(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] || "";
  return "";
}

export default async function RateDetailPageRedirect({
  params,
  searchParams,
}: RateDetailPageProps) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const ratingId = resolvedParams?.id || "";
  if (!ratingId) {
    redirect("/rate");
  }

  const query = new URLSearchParams();
  const returnTo = getSingleQueryValue(resolvedSearchParams?.returnTo);
  const owner = getSingleQueryValue(resolvedSearchParams?.owner);

  const safeReturnTo = safeInternalPath(returnTo);
  if (safeReturnTo) {
    query.set("returnTo", safeReturnTo);
  }

  if (owner) {
    query.set("owner", owner);
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/history/rate/${ratingId}${suffix}`);
}
