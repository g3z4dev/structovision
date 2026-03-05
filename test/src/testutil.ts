export function cartesian<T>(ar1: T[], ar2: T[]): [T, T][] {
    return ar1.flatMap(a => ar2.map(b => [a, b] as [T, T]));
}