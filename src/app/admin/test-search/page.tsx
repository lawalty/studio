'use client';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { testSearch, SearchResult } from '@/ai/flows/test-search-flow';
import { Loader2, Search } from 'lucide-react';

export default function TestSearchPage() {
  const [query, setQuery] = useState('');
  const [distanceThreshold, setDistanceThreshold] = useState(0.4);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchMessage, setSearchMessage] = useState('');
  const [searchError, setSearchError] = useState('');

  const handleSearch = async () => {
    setIsSearching(true);
    setSearchResults(null);
    setSearchMessage('');
    setSearchError('');
    try {
      const { success, message, results, error } = await testSearch({ query, distanceThreshold });
      setSearchMessage(message);
      if (success) {
        setSearchResults(results);
      }
      if (error) {
        setSearchError(error);
      }
    } catch (e: any) {
      setSearchError(e.message || 'An unknown client-side error occurred.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Test Vector Search</CardTitle>
          <CardDescription>
            Enter a query to test the knowledge base search functionality.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search-query">Query</Label>
            <Input
              id="search-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter your search query..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="distance-threshold">Distance Threshold: {distanceThreshold}</Label>
            <Slider
              id="distance-threshold"
              min={0}
              max={1}
              step={0.01}
              value={[distanceThreshold]}
              onValueChange={(value) => setDistanceThreshold(value[0])}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSearch} disabled={isSearching}>
            {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Search
          </Button>
        </CardFooter>
      </Card>

      {searchMessage && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{searchMessage}</p>
            {searchError && (
                <div className="text-red-500 mt-2">
                    <p><strong>Error:</strong> {searchError}</p>
                </div>
            )}
            {searchResults && searchResults.length > 0 && (
              <div className="mt-4 space-y-4">
                {searchResults.map((result, index) => (
                  <div key={index} className="border p-4 rounded-md">
                    <h3 className="font-bold">{result.sourceName}</h3>
                    <p className="text-sm text-gray-500">Distance: {result.distance.toFixed(4)}</p>
                    <p className="mt-2">{result.text}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
