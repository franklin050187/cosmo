vcl 4.1;

backend default {
    .host = "app";
    .port = "8000";
}

sub vcl_recv {
    if (req.url ~ "^/(myships|login|callback|myfavorite|logoff)") {
        return (pass);
    }
}

sub vcl_backend_response {
    if (bereq.url ~ "^/(myships|login|callback|myfavorite|logoff)") {
        set beresp.ttl = 0s;
        return (pass);
    }
    set beresp.ttl = 5m;
}

sub vcl_deliver {
    if (obj.hits > 0) {
        set resp.http.X-Cache = "HIT";
    } else {
        set resp.http.X-Cache = "MISS";
    }
}
